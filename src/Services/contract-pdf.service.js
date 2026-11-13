const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PDFDocument = require('pdfkit');
const { query } = require('./db.service');
const mail = require('./mail.service');

const execFileAsync = promisify(execFile);
const ARCHIVES_DIR = path.join(__dirname, '..', '..', 'private_uploads', 'contract-document-archives');

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS contrats_documents_empreintes (
      id_empreinte BIGINT NOT NULL AUTO_INCREMENT,
      id_contrat INT NOT NULL,
      id_paiement INT NULL,
      id_utilisateur INT NULL,
      type_pdf ENUM('archive_pdfa','copie_chiffree') NOT NULL,
      sha256 CHAR(64) NOT NULL,
      archive_filename VARCHAR(80) NULL,
      email_destinataire VARCHAR(255) NULL,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_empreinte),
      KEY idx_contrat_pdf_hash (id_contrat, date_creation),
      KEY idx_contrat_pdf_payment (id_paiement, type_pdf)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function formattedAmount(value) {
  return `${Number(value || 0).toLocaleString('fr-FR')} MGA`;
}

function appendSection(pdf, heading) {
  if (pdf.y > pdf.page.height - 110) pdf.addPage();
  pdf.moveDown(0.7);
  pdf.font('Helvetica-Bold').fontSize(12).fillColor('#243746').text(heading);
  pdf.moveDown(0.25).font('Helvetica').fontSize(9).fillColor('#17212b');
}

function appendField(pdf, label, value) {
  pdf.font('Helvetica-Bold').text(`${label} : `, { continued: true });
  pdf.font('Helvetica').text(String(value || '—'));
  pdf.moveDown(0.2);
}

function createPdfBuffer(document, password, ownerPassword) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: { top: 48, right: 48, bottom: 76, left: 48 },
      bufferPages: true,
      pdfVersion: password ? '1.7ext3' : '1.7',
      ...(password ? {
        userPassword: password,
        ownerPassword,
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: false,
          documentAssembly: false,
        },
      } : {}),
    });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    pdf.info.Title = `${document.type === 'edl' ? 'État des lieux' : 'Contrat de colocation'} ${document.reference}`;
    pdf.info.Author = 'Coloc’KOO';
    pdf.info.Subject = `Document contractuel ${document.reference}`;
    pdf.info.Creator = 'Coloc’KOO';
    pdf.info.CreationDate = new Date();

    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#243746')
      .text(document.type === 'edl' ? 'ÉTAT DES LIEUX' : 'CONTRAT DE COLOCATION', { align: 'center' });
    pdf.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#667085')
      .text(`Référence ${document.reference}`, { align: 'center' });

    appendSection(pdf, 'Logement');
    appendField(pdf, 'Adresse', document.address);
    appendField(pdf, 'Type de bien', document.propertyType);
    appendField(pdf, 'Surface', document.surface ? `${document.surface} m²` : null);
    appendField(pdf, 'Date d’entrée', document.moveInDate);

    appendSection(pdf, 'Parties');
    for (const party of document.parties) {
      if (pdf.y > pdf.page.height - 125) pdf.addPage();
      pdf.font('Helvetica-Bold').text(`${party.name} — ${party.role}`);
      pdf.font('Helvetica').text(`CIN : ${party.cin || '—'} · Téléphone : ${party.phone || '—'} · E-mail : ${party.email || '—'}`);
      pdf.moveDown(0.35);
    }

    if (document.type === 'contrat') {
      appendSection(pdf, 'Conditions de location');
      appendField(pdf, 'Type de bail', document.leaseType);
      appendField(pdf, 'Clause de solidarité', document.solidarity);
      appendField(pdf, 'Loyer mensuel', formattedAmount(document.rent));
      appendField(pdf, 'Charges mensuelles', formattedAmount(document.charges));
      appendField(pdf, 'Dépôt de garantie', formattedAmount(document.deposit));
    } else {
      appendSection(pdf, 'État des lieux — constat commun');
      pdf.text('Les parties déclarent avoir examiné ensemble les pièces, équipements et éléments du logement à la date du constat.');
      appendField(pdf, 'Date du constat', document.moveInDate);
      appendSection(pdf, 'Pièces et équipements à vérifier');
      pdf.text('Entrée · Séjour · Cuisine · Chambres · Salle de bain · Toilettes · Équipements · Compteurs');
      pdf.moveDown(0.5).text('Observations par pièce :');
      for (let index = 0; index < 8; index += 1) {
        if (pdf.y > pdf.page.height - 100) pdf.addPage();
        pdf.moveDown(0.5).moveTo(48, pdf.y + 12).lineTo(pdf.page.width - 48, pdf.y + 12)
          .strokeColor('#d6dde3').stroke();
        pdf.moveDown(0.8);
      }
    }

    if (document.clauses.length) {
      appendSection(pdf, document.type === 'edl' ? 'Éléments convenus' : 'Clauses du contrat');
      for (const clause of document.clauses) {
        pdf.font('Helvetica-Bold').text(clause.titre || '');
        if (clause.description) pdf.font('Helvetica').text(clause.description);
        pdf.moveDown(0.3);
      }
    }

    if (document.type === 'contrat') {
      appendSection(pdf, 'Clause de solidarité');
      pdf.text(document.solidarity === 'sans'
        ? 'Chaque colocataire demeure responsable de sa propre part.'
        : 'En cas de défaut de l’un des colocataires, les autres peuvent être redevables de l’ensemble du loyer.');
    }

    pdf.addPage();
    appendSection(pdf, 'Signatures');
    pdf.text(`Fait à ${document.city || '—'}, le ____________________.`);
    for (const party of document.parties) {
      if (pdf.y > pdf.page.height - 150) pdf.addPage();
      const signatureY = pdf.y + 20;
      pdf.font('Helvetica-Bold').fontSize(9).text(party.name, 48, signatureY, { width: 230 });
      pdf.font('Helvetica').text(party.role, 48, signatureY + 14, { width: 230 });
      pdf.moveTo(48, signatureY + 82).lineTo(278, signatureY + 82).strokeColor('#52616b').stroke();
      pdf.text('Signature', 48, signatureY + 87, { width: 230, align: 'center' });
      pdf.y = signatureY + 125;
    }

    const pages = pdf.bufferedPageRange();
    for (let pageIndex = pages.start; pageIndex < pages.start + pages.count; pageIndex += 1) {
      pdf.switchToPage(pageIndex);
      const footerY = pdf.page.height - 58;
      pdf.save();
      pdf.moveTo(48, footerY - 8).lineTo(pdf.page.width - 48, footerY - 8).strokeColor('#d6dde3').stroke();
      pdf.font('Helvetica').fontSize(8).fillColor('#52616b')
        .text(`Acheteur : ${document.buyerName}`, 48, footerY - 1, {
          width: pdf.page.width - 96,
          height: 10,
          align: 'center',
          lineBreak: false,
        });
      pdf.text(`Transaction : ${document.transactionReference}`, 48, footerY + 10, {
        width: pdf.page.width - 96,
        height: 10,
        align: 'center',
        lineBreak: false,
      });
      pdf.restore();
    }
    pdf.end();
  });
}

function postScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

async function createPdfaArchive(document) {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-contract-'));
  const inputPath = path.join(temporaryDirectory, 'source.pdf');
  const outputPath = path.join(temporaryDirectory, 'archive.pdf');
  const definitionPath = path.join(temporaryDirectory, 'pdfa-definition.ps');
  const metadataPath = path.join(temporaryDirectory, 'pdfa-metadata.xml');
  const iccProfile = process.env.PDF_A_ICC_PROFILE || '/usr/share/color/icc/ghostscript/default_rgb.icc';
  const definition = [
    '%!',
    `/ICCProfile (${postScriptString(iccProfile)}) def`,
    `/XMPMetadata (${postScriptString(metadataPath)}) def`,
    '[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark',
    '[{icc_PDFA} << /N 3 >> /PUT pdfmark',
    '[{icc_PDFA} ICCProfile (r) file /PUT pdfmark',
    '[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark',
    '[{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1',
    '/OutputConditionIdentifier (sRGB IEC61966-2.1)',
    '/Info (sRGB IEC61966-2.1) /RegistryName (http://www.color.org)',
    '/DestOutputProfile {icc_PDFA} >> /PUT pdfmark',
    '[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark',
    '[/_objdef {metadata_PDFA} /type /stream /OBJ pdfmark',
    '[{metadata_PDFA} << /Type /Metadata /Subtype /XML >> /PUT pdfmark',
    '[{metadata_PDFA} XMPMetadata (r) file /PUT pdfmark',
    '[{Catalog} <</Metadata {metadata_PDFA}>> /PUT pdfmark',
  ].join('\n');
  const xmpMetadata = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      pdfaid:part="2"
      pdfaid:conformance="B"/>
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  try {
    await fs.promises.access(iccProfile, fs.constants.R_OK);
    await fs.promises.writeFile(inputPath, await createPdfBuffer(document), { mode: 0o600 });
    await fs.promises.writeFile(definitionPath, definition, { mode: 0o600 });
    await fs.promises.writeFile(metadataPath, xmpMetadata, { mode: 0o600 });
    await execFileAsync(process.env.GS_BIN || 'gs', [
      '-dPDFA=2',
      '-dBATCH',
      '-dNOPAUSE',
      '-dPDFACompatibilityPolicy=1',
      '-sDEVICE=pdfwrite',
      '-sColorConversionStrategy=RGB',
      '-dCompatibilityLevel=1.7',
      `-sOutputFile=${outputPath}`,
      `--permit-file-read=${iccProfile}`,
      `--permit-file-read=${metadataPath}`,
      '-f',
      definitionPath,
      '-f',
      inputPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const archive = await fs.promises.readFile(outputPath);
    if (!archive.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Ghostscript n’a pas généré une archive PDF/A valide.');
    }
    return archive;
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function savePdfaArchive(document) {
  await fs.promises.mkdir(ARCHIVES_DIR, { recursive: true, mode: 0o700 });
  const archive = await createPdfaArchive(document);
  const filename = `${crypto.randomBytes(20).toString('hex')}.pdf`;
  await fs.promises.writeFile(path.join(ARCHIVES_DIR, filename), archive, { flag: 'wx', mode: 0o600 });
  return {
    filename,
    sha256: crypto.createHash('sha256').update(archive).digest('hex'),
  };
}

async function recordFingerprint({ contractId, paymentId, userId, type, sha256, filename, email }) {
  await query(
    `INSERT INTO contrats_documents_empreintes
      (id_contrat, id_paiement, id_utilisateur, type_pdf, sha256, archive_filename, email_destinataire)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      contractId,
      paymentId ?? null,
      userId ?? null,
      type,
      sha256,
      filename || null,
      email || null,
    ]
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR');
}

async function createContractEmailDocuments(contractId, password) {
  await ensureSchema();
  const rows = await query(
    `SELECT c.id_contrat, c.reference, c.type, c.type_bail, c.clause_solidarite,
            c.montant_total, a.titre, a.type_propriete, a.surface_totale,
            a.adresse_exacte, a.quartier, a.id_utilisateur AS owner_id,
            v.nom_ville, ch.prix_loyer, ch.prix_charges, ch.montant_garantie,
            ch.date_disponibilite
       FROM contrats c
       JOIN annonces a ON a.id_annonce = c.id_annonce
       LEFT JOIN villes v ON v.id_ville = a.id_ville
       LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      WHERE c.id_contrat = ?
      LIMIT 1`,
    [contractId]
  );
  if (!rows.length) {
    const error = new Error('Contrat introuvable.');
    error.status = 404;
    throw error;
  }
  const contract = rows[0];
  const parties = await query(
    `SELECT pc.id_utilisateur, pc.nom_complet, pc.role, pc.cin, pc.telephone,
            COALESCE(NULLIF(u.email, ''), NULLIF(pc.email, '')) AS email,
            COALESCE(NULLIF(u.cin, ''), NULLIF(pc.cin, '')) AS party_cin,
            COALESCE(NULLIF(u.telephone, ''), NULLIF(pc.telephone, '')) AS party_telephone
       FROM parties_contrats pc
       LEFT JOIN utilisateurs u ON u.id_utilisateur = pc.id_utilisateur
      WHERE pc.id_contrat = ?
      ORDER BY pc.role, pc.id`,
    [contractId]
  );
  const colocataires = parties.filter((party) => /coloc/i.test(party.role || ''));
  if (!parties.length || !colocataires.length) {
    const error = new Error('Les parties du contrat sont incomplètes.');
    error.status = 409;
    throw error;
  }
  const recipients = [...new Map(
    parties
      .filter((party) => party.email && party.email.trim())
      .map((party) => [party.email.trim().toLowerCase(), {
        email: party.email.trim(),
        id_utilisateur: party.id_utilisateur,
      }])
  ).values()];
  if (recipients.length < 2 || parties.some((party) => !party.email || !party.email.trim())) {
    const error = new Error('Toutes les parties du contrat doivent avoir une adresse e-mail valide.');
    error.status = 409;
    throw error;
  }
  const paymentRows = await query(
    `SELECT p.id_paiement, p.id_utilisateur, p.reference, p.reference_operateur,
            p.statut, u.nom, u.prenom
       FROM paiements p
       JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
      WHERE p.id_contrat = ? AND p.service_type = 'contrat'
      ORDER BY p.id_paiement`,
    [contractId]
  );
  const payments = paymentRows.filter((payment) => ['conforme', 'valide'].includes(payment.statut));
  const paidUserIds = new Set(payments.map((payment) => Number(payment.id_utilisateur)));
  const missingPayments = colocataires.filter((party) =>
    !paymentRows.some((payment) => Number(payment.id_utilisateur) === Number(party.id_utilisateur))
  );
  if (missingPayments.length) {
    const names = missingPayments.map((party) => party.nom_complet || 'un colocataire').join(', ');
    const error = new Error(`Aucun paiement n’est enregistré pour ${names}. Chaque colocataire doit d’abord soumettre sa référence de transaction.`);
    error.status = 409;
    throw error;
  }
  const unverifiedPayments = colocataires.filter((party) =>
    !paidUserIds.has(Number(party.id_utilisateur))
      && paymentRows.some((payment) => Number(payment.id_utilisateur) === Number(party.id_utilisateur)
        && !['non-conforme', 'echoue'].includes(payment.statut))
  );
  if (unverifiedPayments.length) {
    const names = unverifiedPayments.map((party) => party.nom_complet || 'un colocataire').join(', ');
    const error = new Error(`Le paiement de ${names} est enregistré, mais n’a pas encore été vérifié par l’équipe Coloc’KOO.`);
    error.status = 409;
    throw error;
  }
  const rejectedPayments = colocataires.filter((party) =>
    !paidUserIds.has(Number(party.id_utilisateur))
      && paymentRows.some((payment) => Number(payment.id_utilisateur) === Number(party.id_utilisateur)
        && ['non-conforme', 'echoue'].includes(payment.statut))
  );
  if (rejectedPayments.length) {
    const names = rejectedPayments.map((party) => party.nom_complet || 'un colocataire').join(', ');
    const error = new Error(`Le paiement de ${names} a été refusé ou échoué. Une nouvelle transaction valide est nécessaire avant l’envoi.`);
    error.status = 409;
    throw error;
  }
  const clauses = await query(
    'SELECT titre, description FROM contrat_clauses WHERE est_actif = 1 ORDER BY ordre, id_clause'
  );
  const address = [contract.adresse_exacte, contract.quartier, contract.nom_ville].filter(Boolean).join(', ');
  const documents = [];
  for (const payment of payments) {
    const buyerName = [payment.prenom, payment.nom].filter(Boolean).join(' ').trim() || 'Colocataire';
    const transactionReference = String(payment.reference_operateur || payment.reference || payment.id_paiement);
    const document = {
      reference: contract.reference || `CT-${contract.id_contrat}`,
      type: contract.type,
      address: address || contract.nom_ville || '—',
      propertyType: contract.type_propriete || contract.titre,
      surface: contract.surface_totale,
      moveInDate: formatDate(contract.date_disponibilite),
      city: contract.nom_ville,
      leaseType: contract.type_bail === 'individuel' ? 'Bail individuel' : 'Bail collectif',
      solidarity: contract.clause_solidarite || 'avec',
      rent: contract.prix_loyer,
      charges: contract.prix_charges,
      deposit: contract.montant_garantie || contract.prix_loyer,
      buyerName,
      transactionReference,
      parties: parties.map((party) => ({
        name: party.nom_complet || 'Partie',
        role: party.role || 'Partie',
        cin: party.party_cin,
        phone: party.party_telephone,
        email: party.email,
      })),
      clauses,
    };
    const archive = await savePdfaArchive(document);
    await recordFingerprint({
      contractId,
      paymentId: payment.id_paiement,
      type: 'archive_pdfa',
      sha256: archive.sha256,
      filename: archive.filename,
    });
    const ownerPassword = crypto.randomBytes(32).toString('base64url');
    const protectedPdf = await createPdfBuffer(document, password, ownerPassword);
    const protectedHash = crypto.createHash('sha256').update(protectedPdf).digest('hex');
    await recordFingerprint({
      contractId,
      paymentId: payment.id_paiement,
      type: 'copie_chiffree',
      sha256: protectedHash,
    });
    documents.push({
      paymentId: Number(payment.id_paiement),
      buyerName,
      transactionReference,
      protectedPdf,
      protectedHash,
      filename: `${String(contract.reference || `contrat-${contract.id_contrat}`).replace(/[^A-Za-z0-9_-]/g, '')}-${payment.id_paiement}.pdf`,
    });
  }
  return { contract, parties, recipients, documents };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendContractDocuments(contractId) {
  if (!mail.isConfigured()) {
    const error = new Error('Le service d’e-mail n’est pas configuré.');
    error.status = 503;
    throw error;
  }
  const password = crypto.randomBytes(12).toString('base64url');
  const { contract, recipients, documents } = await createContractEmailDocuments(contractId, password);
  const attachments = documents.map((document) => ({
    filename: document.filename,
    content: document.protectedPdf,
    contentType: 'application/pdf',
    contentDisposition: 'attachment',
  }));
  const subject = `Document ${contract.type === 'edl' ? 'État des lieux' : 'Contrat'} - ${contract.reference || contractId}`;
  const transactionList = documents.map((document) =>
    `<li>${escapeHtml(document.buyerName)} — transaction ${escapeHtml(document.transactionReference)}</li>`
  ).join('');
  const html = mail.wrapLayout(subject, `
    <p>Bonjour,</p>
    <p>Veuillez trouver en pièce jointe le PDF protégé du ${contract.type === 'edl' ? 'document d’état des lieux' : 'contrat de colocation'} <strong>${escapeHtml(contract.reference || contractId)}</strong>.</p>
    <p>Le mot de passe d’ouverture du PDF est : <strong>${escapeHtml(password)}</strong></p>
    <p>Les copies jointes sont protégées contre la modification et l’impression est autorisée.</p>
    <p>Transactions associées :</p>
    <ul>${transactionList}</ul>
    <p>Conservez le document et son mot de passe. Une archive PDF/A et les empreintes numériques des documents ont été conservées par Coloc’KOO.</p>
    <p>L’équipe Coloc’KOO</p>
  `);
  const text = [
    `Veuillez trouver en pièce jointe le PDF du document ${contract.reference || contractId}.`,
    `Mot de passe PDF : ${password}`,
    'Le document est protégé contre la modification ; l’impression est autorisée.',
    'Transactions associées :',
    ...documents.map((document) => `${document.buyerName} — transaction ${document.transactionReference}`),
    'Une archive PDF/A et les empreintes numériques des documents ont été conservées par Coloc’KOO.',
  ].join('\n');

  const failures = [];
  let sent = 0;
  for (const recipient of recipients) {
    const delivered = await mail.sendEmail(recipient.email, subject, html, text, attachments);
    if (!delivered) {
      failures.push(recipient.email);
      continue;
    }
    sent += 1;
    for (const document of documents) {
      await recordFingerprint({
        contractId,
        paymentId: document.paymentId,
        userId: recipient.id_utilisateur,
        type: 'copie_chiffree',
        sha256: document.protectedHash,
        email: recipient.email,
      });
    }
  }

  if (sent > 0) {
    await query(
      `UPDATE contrats
          SET statut = 'envoye', date_emission = COALESCE(date_emission, NOW())
        WHERE id_contrat = ?`,
      [contractId]
    );
  }
  return {
    sent,
    total: recipients.length,
    pdfCount: documents.length,
    failures,
    destinataires: recipients.map((recipient) => recipient.email),
  };
}

module.exports = {
  createContractEmailDocuments,
  recordFingerprint,
  sendContractDocuments,
  createPdfBuffer,
  createPdfaArchive,
};
