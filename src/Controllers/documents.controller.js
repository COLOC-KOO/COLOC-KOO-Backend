const { query, insertAndGetId, withTransaction } = require('../Services/db.service');
const { ensureContractContent, getConfigValue } = require('./meta.controller');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const PDFDocument = require('pdfkit');
const { renderContratsImmoPdf } = require('../Services/contrats-immo-data.service');
const {
  TEMPLATES,
  TEMPLATE_TITLES,
  getTemplateParagraphs,
  validateTemplateEdits,
} = require('../Services/contrats-immo-template.service');

const PROFILE_ROLES = new Set(['locataire', 'proprietaire', 'professionnel']);
const PAYMENT_PROOFS_DIR = path.join(__dirname, '..', '..', 'private_uploads', 'document-payment-proofs');
const DOCUMENT_ARCHIVES_DIR = path.join(__dirname, '..', '..', 'private_uploads', 'document-archives');
const DOCUMENT_ANNEXES_DIR = path.join(__dirname, '..', '..', 'private_uploads', 'document-annexes');
const DOCUMENT_DATA_KEY_PATH = path.join(__dirname, '..', '..', 'private_uploads', 'document-data.key');
const execFileAsync = promisify(execFile);

async function ensureDocumentRequestsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS demandes_documents_contractuels (
      id_demande INT NOT NULL AUTO_INCREMENT,
      reference VARCHAR(32) NOT NULL,
      id_utilisateur INT NOT NULL,
      type_document ENUM('contrat','edl') NOT NULL,
      template_id VARCHAR(60) NULL,
      profil_demandeur VARCHAR(30) NOT NULL,
      donnees JSON NOT NULL,
      clauses_ids JSON NULL,
      clauses_snapshot JSON NULL,
      preuve_paiement VARCHAR(80) NULL,
      archive_filename VARCHAR(80) NULL,
      archive_sha256 CHAR(64) NULL,
      archive_generated_at DATETIME NULL,
      montant INT NOT NULL,
      statut ENUM('brouillon','a-verifier','en-cours','valide','refuse') NOT NULL DEFAULT 'brouillon',
      statut_paiement ENUM('en-attente','a-verifier','conforme','non-conforme') NOT NULL DEFAULT 'en-attente',
      moyen_paiement VARCHAR(80) NULL,
      reference_operateur VARCHAR(255) NULL,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_demande),
      UNIQUE KEY uq_documents_contractuels_reference (reference),
      KEY idx_documents_contractuels_user (id_utilisateur, date_creation),
      KEY idx_documents_contractuels_status (statut, statut_paiement)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS empreintes_documents_contractuels (
      id_empreinte BIGINT NOT NULL AUTO_INCREMENT,
      id_demande INT NOT NULL,
      id_utilisateur INT NOT NULL,
      type_pdf VARCHAR(30) NOT NULL,
      sha256 CHAR(64) NOT NULL,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_empreinte),
      KEY idx_empreintes_document (id_demande, date_creation),
      KEY idx_empreintes_sha256 (sha256)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS revisions_modeles_documents_contractuels (
      id_revision BIGINT NOT NULL AUTO_INCREMENT,
      template_id VARCHAR(60) NOT NULL,
      numero_revision INT NOT NULL,
      modifications JSON NOT NULL,
      sha256 CHAR(64) NOT NULL,
      actif TINYINT(1) NOT NULL DEFAULT 1,
      id_utilisateur INT NOT NULL,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_revision),
      UNIQUE KEY uq_modele_revision (template_id, numero_revision),
      KEY idx_modele_actif (template_id, actif, numero_revision)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const fingerprintType = await query("SHOW COLUMNS FROM empreintes_documents_contractuels LIKE 'type_pdf'");
  if (String(fingerprintType[0]?.Type || '').toLowerCase().startsWith('enum(')) {
    await query("ALTER TABLE empreintes_documents_contractuels MODIFY COLUMN type_pdf VARCHAR(30) NOT NULL");
  }
  const snapshotColumn = await query(
    "SHOW COLUMNS FROM demandes_documents_contractuels LIKE 'clauses_snapshot'"
  );
  if (!snapshotColumn.length) {
    await query('ALTER TABLE demandes_documents_contractuels ADD COLUMN clauses_snapshot JSON NULL AFTER clauses_ids');
  }
  const proofColumn = await query(
    "SHOW COLUMNS FROM demandes_documents_contractuels LIKE 'preuve_paiement'"
  );
  if (!proofColumn.length) {
    await query('ALTER TABLE demandes_documents_contractuels ADD COLUMN preuve_paiement VARCHAR(80) NULL AFTER clauses_snapshot');
  }
  const archiveColumns = [
    ['template_id', 'VARCHAR(60) NULL AFTER type_document'],
    ['archive_filename', 'VARCHAR(80) NULL AFTER preuve_paiement'],
    ['archive_sha256', 'CHAR(64) NULL AFTER archive_filename'],
    ['archive_generated_at', 'DATETIME NULL AFTER archive_sha256'],
  ];
  for (const [name, definition] of archiveColumns) {
    const column = await query(
      `SHOW COLUMNS FROM demandes_documents_contractuels LIKE '${name}'`
    );
    if (!column.length) {
      await query(`ALTER TABLE demandes_documents_contractuels ADD COLUMN ${name} ${definition}`);
    }
  }
  const deletedColumn = await query("SHOW COLUMNS FROM demandes_documents_contractuels LIKE 'client_deleted'");
  if (!deletedColumn.length) {
    await query("ALTER TABLE demandes_documents_contractuels ADD COLUMN client_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER archive_generated_at");
  }
  for (const [name, definition] of [
    ['download_token_hash', 'CHAR(64) NULL AFTER client_deleted'],
    ['download_token_expires_at', 'DATETIME NULL AFTER download_token_hash'],
    ['autorisation_filename', 'VARCHAR(80) NULL AFTER download_token_expires_at'],
    ['mandat_filename', 'VARCHAR(80) NULL AFTER autorisation_filename'],
  ]) {
    const column = await query(`SHOW COLUMNS FROM demandes_documents_contractuels LIKE '${name}'`);
    if (!column.length) await query(`ALTER TABLE demandes_documents_contractuels ADD COLUMN ${name} ${definition}`);
  }
}

function parseTemplateEdits(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function getActiveTemplateEdits() {
  const rows = await query('SELECT template_id, modifications FROM revisions_modeles_documents_contractuels WHERE actif = 1');
  return Object.fromEntries(rows.map((row) => [row.template_id, parseTemplateEdits(row.modifications)]));
}

async function listBackofficeTemplates(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const templateId = req.params.templateId;
    if (!Object.prototype.hasOwnProperty.call(TEMPLATES, templateId)) {
      return res.status(404).json({ message: 'Modèle introuvable.' });
    }
    const [history] = await Promise.all([
      query('SELECT id_revision, numero_revision, modifications, sha256, actif, date_creation FROM revisions_modeles_documents_contractuels WHERE template_id = ? ORDER BY numero_revision DESC LIMIT 30', [templateId]),
    ]);
    res.json({
      template: { id: templateId, title: TEMPLATE_TITLES[templateId] },
      paragraphs: getTemplateParagraphs(templateId),
      revisions: history.map((revision) => ({
        id: revision.id_revision,
        version: revision.numero_revision,
        edits: parseTemplateEdits(revision.modifications),
        sha256: revision.sha256,
        active: Boolean(revision.actif),
        created_at: revision.date_creation,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function saveBackofficeTemplate(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const templateId = req.params.templateId;
    if (!Object.prototype.hasOwnProperty.call(TEMPLATES, templateId)) {
      return res.status(404).json({ message: 'Modèle introuvable.' });
    }
    let edits;
    try {
      edits = validateTemplateEdits(templateId, req.body?.edits);
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Modifications du modèle invalides.' });
    }
    const serialized = JSON.stringify(edits);
    const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
    const revision = await withTransaction(async (tx) => {
      const rows = await tx('SELECT numero_revision AS latest FROM revisions_modeles_documents_contractuels WHERE template_id = ? ORDER BY numero_revision DESC LIMIT 1 FOR UPDATE', [templateId]);
      const nextVersion = Number(rows[0]?.latest || 0) + 1;
      await tx('UPDATE revisions_modeles_documents_contractuels SET actif = 0 WHERE template_id = ? AND actif = 1', [templateId]);
      const inserted = await tx(
        'INSERT INTO revisions_modeles_documents_contractuels (template_id, numero_revision, modifications, sha256, actif, id_utilisateur) VALUES (?, ?, ?, ?, 1, ?)',
        [templateId, nextVersion, serialized, sha256, currentUserId(req)]
      );
      return { id: inserted.insertId, version: nextVersion };
    });
    res.status(201).json({ ok: true, ...revision, sha256 });
  } catch (error) {
    next(error);
  }
}

async function documentDataKey() {
  await fs.promises.mkdir(path.dirname(DOCUMENT_DATA_KEY_PATH), { recursive: true, mode: 0o700 });
  try {
    const key = await fs.promises.readFile(DOCUMENT_DATA_KEY_PATH);
    if (key.length === 32) return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const key = crypto.randomBytes(32);
  try {
    await fs.promises.writeFile(DOCUMENT_DATA_KEY_PATH, key, { flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return documentDataKey();
  }
}

async function encryptRequestData(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await documentDataKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
}

async function decryptRequestData(value) {
  const envelope = parseJson(value, {});
  if (!envelope?.v || !envelope.iv || !envelope.tag || !envelope.data) return envelope;
  const decipher = crypto.createDecipheriv('aes-256-gcm', await documentDataKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function currentUserId(req) {
  return Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function validateData(type, profile, data, templateId) {
  const isMainContract = ['contrat_intercolocs', 'contrat_propriocolocs', 'contrat_mandacolocs'].includes(templateId);
  if (templateId && !Object.prototype.hasOwnProperty.call(TEMPLATES, templateId)) return ['template_id'];
  if (templateId && !isMainContract) {
    const entries = Object.entries(data || {});
    if (!entries.some(([, value]) => typeof value === 'string' ? value.trim() : Array.isArray(value) && value.length > 0)) return ['donnees'];
    if (entries.some(([, value]) => typeof value !== 'string' || value.length > 4000)) return ['donnees'];
    const issues = [];
    if (['autorisation_colocation', 'avenant_substitution'].includes(templateId)) {
      const reduction = String(data.retribution_reduction_valeur || '').trim();
      if (data.retribution_reduction === 'true') {
        const match = reduction.match(/^(\d+(?:[.,]\d{1,2})?)\s*(%|ar)?$/i);
        const amount = match ? Number(match[1].replace(',', '.')) : NaN;
        const rent = Number(String(data.loyer_total || data.loyer || '').replace(/\s/g, ''));
        const isRate = match?.[2] === '%';
        if (!match || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rent) || rent <= 0 || (isRate ? amount > 10 : amount > rent * 0.1)) {
          issues.push('retribution_reduction_valeur (montant requis, maximum 10 % du loyer total)');
        }
      }
      if (templateId === 'autorisation_colocation' && (data.regime_solidaire === 'false' || data.regime_solidaire === false) && data.retribution_marge === 'true') {
        issues.push('retribution_marge (indisponible en régime individuel)');
      }
    }
    if (templateId === 'mandat_gestion' && data.repartition_texte) {
      const rows = String(data.repartition_texte).split(/\r?\n/).filter(Boolean);
      if (rows.length > 7) issues.push('repartition_texte (7 lignes maximum)');
    }
    return issues;
  }
  const required = [
    'adresse', 'code_postal', 'ville', 'type_bien', 'nom_demandeur', 'telephone_demandeur',
    'email_demandeur', 'nom_autre_partie', 'telephone_autre_partie',
    'email_autre_partie', 'date_entree',
  ];
  if (type === 'contrat') required.push('loyer');
  if (profile === 'professionnel') required.push('nom_entreprise', 'representant');
  const invalid = Object.entries(data || {})
    .filter(([key, value]) => typeof value !== 'string' || value.length > 4000)
    .map(([key]) => key);
  const missing = required.filter((key) => !String(data?.[key] ?? '').trim());
  const invalidNames = ['nom_demandeur', 'nom_autre_partie']
    .filter((key) => String(data?.[key] || '').length > 150);
  const invalidIdentityFields = [];
  for (const key of ['cin_demandeur', 'cin_autre_partie']) {
    const value = String(data?.[key] ?? '');
    if (value && !/^\d{1,12}$/.test(value)) invalidIdentityFields.push(key);
  }
  for (const key of ['telephone_demandeur', 'telephone_autre_partie']) {
    const value = String(data?.[key] ?? '');
    if (value && !/^\+?\d{1,13}$/.test(value)) invalidIdentityFields.push(key);
  }
  const invalidTunnel = [];
  if (type === 'contrat') {
    const tunnelRequired = [
      'nombre_colocataires', 'choix_colocataires', 'solidarite', 'meuble', 'duree_bail',
      'mois_depot', 'periodicite_revision', 'niveaux_texte', 'espace_privatif_description', 'charges_avec', 'modes_reglement',
      'taux_revision', 'preavis_bailleur', 'jour_paiement', 'salle_bain_privee',
    ];
    if (profile !== 'professionnel') tunnelRequired.push('date_naissance_demandeur', 'ville_naissance_demandeur', 'pays_naissance_demandeur');
    tunnelRequired.push('date_naissance_autre_partie', 'ville_naissance_autre_partie', 'pays_naissance_autre_partie');
    if (profile === 'locataire') tunnelRequired.push('bail_principal_proprietaire', 'bail_principal_date_effet', 'bail_principal_duree', 'bail_principal_date_fin', 'bail_principal_article', 'autorisation_signee');
    if (profile === 'locataire' && data?.autorisation_signee !== 'oui') invalidTunnel.push('autorisation_signee');
    if (profile === 'locataire') tunnelRequired.push('revision_date_anniversaire');
    for (const key of tunnelRequired) if (!String(data?.[key] ?? '').trim()) invalidTunnel.push(key);
    if (data?.inclure_charte === 'oui') {
      for (const key of ['tranquillite_21h_6h', 'invites_3_6', 'menage_planning', 'tabac_exterieur', 'tabac_interieur_communs', 'tabac_interieur_privatifs', 'tabac_espaces_designes']) {
        if (!['oui', 'non', 'true', 'false'].includes(String(data?.[key] ?? '').toLowerCase())) invalidTunnel.push(key);
      }
      if (data?.tranquillite_21h_6h === 'non' && (!data.tranquillite_debut || !data.tranquillite_fin)) invalidTunnel.push('tranquillite_debut/fin');
      if (data?.invites_3_6 === 'non' && !data.invites_limite_nuits) invalidTunnel.push('invites_limite_nuits');
      if (data?.tabac_espaces_designes === 'oui' && !data.tabac_espaces) invalidTunnel.push('tabac_espaces');
    }
    if (data?.inclure_attestation_logement === 'oui' && profile === 'professionnel' && !data.gestionnaire_date_naissance) invalidTunnel.push('gestionnaire_date_naissance');
    if (!/^\d+$/.test(String(data?.nombre_colocataires || '')) || Number(data?.nombre_colocataires) < 1) invalidTunnel.push('nombre_colocataires');
    if (!['Individuelle', 'Solidaire'].includes(data?.solidarite)) invalidTunnel.push('solidarite');
    if (!['oui', 'non'].includes(data?.meuble)) invalidTunnel.push('meuble');
    if (!['oui', 'non'].includes(data?.charges_avec)) invalidTunnel.push('charges_avec');
    if (!['oui', 'non'].includes(data?.salle_bain_privee)) invalidTunnel.push('salle_bain_privee');
    if (Number(data?.loyer) <= 0) invalidTunnel.push('loyer');
    if (Number(data?.mois_depot) <= 0) invalidTunnel.push('mois_depot');
    if (Number(data?.periodicite_revision) <= 0) invalidTunnel.push('periodicite_revision');
    if (Number(data?.jour_paiement) < 1 || Number(data?.jour_paiement) > 31) invalidTunnel.push('jour_paiement');
    const levels = String(data?.niveaux_texte || '').split(/\r?\n/).map((line) => line.split('|').map((part) => part.trim()));
    if (!levels.length || levels.length > 3 || levels.some((parts) => !parts[0] || !parts[1])) invalidTunnel.push('niveaux_texte');
    if (data?.charges_avec === 'oui') {
      const charges = String(data?.charges_lignes_texte || '').split(/\r?\n/).map((line) => line.split('|').map((part) => part.trim()));
      if (!charges.length || charges.length > 3 || charges.some((parts) => !parts[0] || !/^\d+$/.test(parts[1] || ''))) invalidTunnel.push('charges_lignes_texte');
    }
    if (profile === 'professionnel') {
      if (!String(data?.nom_proprietaire || '').trim()) invalidTunnel.push('nom_proprietaire');
      if (!String(data?.adresse_proprietaire || '').trim()) invalidTunnel.push('adresse_proprietaire');
      for (const key of ['forme_juridique', 'rcs', 'stat', 'adresse_entreprise', 'date_mandat']) {
        if (!String(data?.[key] || '').trim()) invalidTunnel.push(key);
      }
      if (data?.pouvoir_signature !== 'oui') invalidTunnel.push('pouvoir_signature');
    }
    if (profile === 'proprietaire' && data?.personne_morale === 'oui') {
      if (!String(data?.nom_entreprise || '').trim()) invalidTunnel.push('nom_entreprise');
      if (!String(data?.representant || '').trim()) invalidTunnel.push('representant');
      if (!String(data?.representant_qualite || '').trim()) invalidTunnel.push('representant_qualite');
    }
  } else {
    if (!['oui', 'non'].includes(data?.salle_bain_privee)) invalidTunnel.push('salle_bain_privee');
    if (!['d’entrée', 'de sortie'].includes(data?.edl_type)) invalidTunnel.push('edl_type');
  }
  return [...new Set([...missing, ...invalid, ...invalidIdentityFields, ...invalidNames, ...invalidTunnel])];
}

async function resolvePrice(type) {
  const prefix = type === 'edl' ? 'edl%' : 'contrat%';
  const rows = await query(
    'SELECT COALESCE(SUM(prix), 0) AS total FROM services_ckoo WHERE cle_service LIKE ? AND est_actif = 1',
    [prefix]
  );
  const configured = Number(rows[0]?.total || 0);
  if (configured > 0) return configured;
  const fallback = type === 'edl' ? 10000 : 27000;
  return fallback;
}

async function getSelectedClauses(ids) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!normalized.length) return [];
  const clauses = await query(
    `SELECT id_clause, titre, description FROM contrat_clauses
      WHERE est_actif = 1 AND id_clause IN (${normalized.map(() => '?').join(',')})
      ORDER BY ordre, id_clause`,
    normalized
  );
  if (clauses.length !== normalized.length) {
    const error = new Error('Une ou plusieurs clauses sélectionnées ne sont plus disponibles.');
    error.status = 400;
    throw error;
  }
  return clauses;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function documentHtml({ reference, type, profile, data, clauses, preview = false }) {
  const rows = (items) => items.map(([label, key]) => `
    <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(data[key] || '—')}</td></tr>
  `).join('');
  const otherRole = profile === 'locataire' ? 'Propriétaire / bailleur' : 'Locataire / autre partie';
  const professional = profile === 'professionnel' ? `
    <h2>Professionnel</h2>
    <table>${rows([
      ['Entreprise', 'nom_entreprise'],
      ['NIF / identifiant', 'nif'],
      ['Représentant', 'representant'],
    ])}</table>
  ` : '';
  const lease = type === 'contrat' ? `
    <h2>Conditions de location</h2>
    <table>${rows([
      ['Date d’entrée', 'date_entree'],
      ['Loyer mensuel (Ar)', 'loyer'],
      ['Charges mensuelles (Ar)', 'charges'],
      ['Dépôt de garantie (Ar)', 'caution'],
      ['Type de bail', 'type_bail'],
      ['Clause de solidarité', 'solidarite'],
    ])}</table>
  ` : `
    <h2>État des lieux — constat commun</h2>
    <p>Les parties déclarent avoir examiné ensemble les pièces, équipements et éléments du logement à la date du constat.</p>
    <table>${rows([
      ['Date du constat', 'date_entree'],
      ['Observations générales', 'observations'],
    ])}</table>
  `;
  const clausesHtml = clauses.length
    ? clauses.map((clause) => `<li><strong>${escapeHtml(clause.titre)}</strong><br>${escapeHtml(clause.description || '')}</li>`).join('')
    : '<li>Aucune clause complémentaire sélectionnée.</li>';
  const signaturePage = preview ? '' : `
    <section class="page signatures">
      <h2>Signatures</h2>
      <p>Fait à ${escapeHtml(data.ville || '—')}, le ____________________.</p>
      <div class="signature-grid">
        <div><strong>${escapeHtml(data.nom_demandeur || 'Demandeur')}</strong><br>${escapeHtml(profile)}<div class="line">Signature</div></div>
        <div><strong>${escapeHtml(data.nom_autre_partie || 'Autre partie')}</strong><br>${escapeHtml(otherRole)}<div class="line">Signature</div></div>
      </div>
      <p class="note">Document généré à partir des informations saisies par les parties. Les parties doivent vérifier son contenu avant signature.</p>
    </section>
  `;

  return `<!doctype html>
  <html lang="fr"><head><meta charset="utf-8"><title>${type === 'edl' ? 'État des lieux' : 'Contrat'} ${escapeHtml(reference)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font: 12px Arial, sans-serif; color: #17212b; margin: 0; line-height: 1.45; }
    .page { min-height: 250mm; page-break-after: always; padding: 4mm; }
    h1 { font-size: 21px; text-align: center; margin: 0 0 8px; color: #243746; }
    h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #85cbd6; }
    p { margin: 5px 0 10px; white-space: pre-wrap; }
    .ref { text-align: center; color: #667085; font-size: 10px; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
    th, td { padding: 7px; border: 1px solid #d6dde3; text-align: left; vertical-align: top; }
    th { width: 35%; background: #f3f7f8; }
    li { margin: 8px 0; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; }
    .line { height: 75px; margin-top: 20px; border-bottom: 1px solid #52616b; }
    .note { margin-top: 28px; color: #667085; font-size: 10px; }
    .toolbar { position: sticky; top: 0; padding: 12px; text-align: center; background: #243746; color: white; }
    .toolbar button { padding: 8px 14px; font-weight: bold; cursor: pointer; }
    @media print { .toolbar { display: none; } }
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">${preview ? 'Imprimer l’aperçu' : 'Télécharger / imprimer en PDF'}</button></div>
  <section class="page">
    <h1>${type === 'edl' ? 'État des lieux' : 'Contrat de location / colocation'}</h1>
    <p class="ref">Référence ${escapeHtml(reference)} · Profil : ${escapeHtml(profile)}</p>
    ${professional}
    <h2>Parties</h2>
    <table>${rows([
      ['Demandeur', 'nom_demandeur'],
      ['CIN / identifiant', 'cin_demandeur'],
      ['Téléphone', 'telephone_demandeur'],
      ['E-mail', 'email_demandeur'],
      [otherRole, 'nom_autre_partie'],
      ['CIN / identifiant de l’autre partie', 'cin_autre_partie'],
      ['Téléphone de l’autre partie', 'telephone_autre_partie'],
      ['E-mail de l’autre partie', 'email_autre_partie'],
    ])}</table>
    <h2>Logement</h2>
    <table>${rows([
      ['Adresse', 'adresse'],
      ['Ville', 'ville'],
      ['Type de bien', 'type_bien'],
      ['Quartier', 'quartier'],
    ])}</table>
    ${lease}
  </section>
  <section class="page">
    <h2>${type === 'edl' ? 'Clauses et éléments du constat' : 'Clauses retenues'}</h2>
    <ul>${clausesHtml}</ul>
    <h2>Informations complémentaires</h2>
    <p>${escapeHtml(data.observations || 'Aucune observation complémentaire.')}</p>
    ${type === 'edl' ? '<h2>Pièces et équipements à vérifier</h2><p>Entrée · Séjour · Cuisine · Chambres · Salle de bain · Toilettes · Équipements · Compteurs</p>' : ''}
    <p class="note">Aperçu des deux premières pages. Les pages de signatures ne sont pas incluses dans cet aperçu.</p>
  </section>
  ${signaturePage}
  </body></html>`;
}

function documentPdfBuffer({ reference, type, profile, data, clauses }, password, ownerPassword) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: { top: 48, right: 48, bottom: 86, left: 48 },
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
    pdf.info.Title = `${type === 'edl' ? 'État des lieux' : 'Contrat de location'} ${reference}`;
    pdf.info.Author = String(data.nom_demandeur || 'Coloc’KOO');
    pdf.info.Subject = `Document contractuel ${reference}`;
    pdf.info.Creator = 'Coloc’KOO';
    pdf.info.CreationDate = new Date();

    const title = type === 'edl' ? 'ÉTAT DES LIEUX' : 'CONTRAT DE LOCATION / COLOCATION';
    const otherRole = profile === 'locataire' ? 'Propriétaire / bailleur' : 'Locataire / autre partie';
    const field = (label, value) => {
      pdf.font('Helvetica-Bold').text(`${label} : `, { continued: true });
      pdf.font('Helvetica').text(String(value || '—'));
      pdf.moveDown(0.25);
    };
    const section = (heading) => {
      pdf.moveDown(0.5);
      pdf.font('Helvetica-Bold').fontSize(13).fillColor('#243746').text(heading);
      pdf.moveTo(48, pdf.y + 3).lineTo(547, pdf.y + 3).strokeColor('#85cbd6').stroke();
      pdf.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#17212b');
    };

    pdf.font('Helvetica-Bold').fontSize(18).fillColor('#243746').text(title, { align: 'center' });
    pdf.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#667085')
      .text(`Référence ${reference} · Profil : ${profile}`, { align: 'center' });

    if (profile === 'professionnel') {
      section('Professionnel');
      field('Entreprise', data.nom_entreprise);
      field('NIF / identifiant', data.nif);
      field('Représentant', data.representant);
    }

    section('Parties');
    field('Demandeur', data.nom_demandeur);
    field('CIN / identifiant', data.cin_demandeur);
    field('Téléphone', data.telephone_demandeur);
    field('E-mail', data.email_demandeur);
    field(otherRole, data.nom_autre_partie);
    field('CIN / identifiant de l’autre partie', data.cin_autre_partie);
    field('Téléphone de l’autre partie', data.telephone_autre_partie);
    field('E-mail de l’autre partie', data.email_autre_partie);

    section('Logement');
    field('Adresse', data.adresse);
    field('Ville', data.ville);
    field('Type de bien', data.type_bien);
    field('Quartier', data.quartier);

    if (type === 'contrat') {
      section('Conditions de location');
      field('Date d’entrée', data.date_entree);
      field('Loyer mensuel (Ar)', data.loyer);
      field('Charges mensuelles (Ar)', data.charges);
      field('Dépôt de garantie (Ar)', data.caution);
      field('Type de bail', data.type_bail);
      field('Clause de solidarité', data.solidarite);
    } else {
      section('État des lieux — constat commun');
      pdf.text('Les parties déclarent avoir examiné ensemble les pièces, équipements et éléments du logement à la date du constat.');
      pdf.moveDown(0.4);
      field('Date du constat', data.date_entree);
    }

    section(type === 'edl' ? 'Clauses et éléments du constat' : 'Clauses retenues');
    if (clauses.length) {
      clauses.forEach((clause) => {
        pdf.font('Helvetica-Bold').text(String(clause.titre || ''));
        if (clause.description) pdf.font('Helvetica').text(String(clause.description));
        pdf.moveDown(0.35);
      });
    } else {
      pdf.text('Aucune clause complémentaire sélectionnée.');
    }

    section('Informations complémentaires');
    pdf.text(String(data.observations || 'Aucune observation complémentaire.'));
    if (type === 'edl') {
      section('Pièces et équipements à vérifier');
      pdf.text('Entrée · Séjour · Cuisine · Chambres · Salle de bain · Toilettes · Équipements · Compteurs');
    }

    pdf.addPage();
    section('Signatures');
    pdf.text(`Fait à ${String(data.ville || '—')}, le ____________________.`);
    pdf.moveDown(2);
    const signatureWidth = 230;
    const signatureY = pdf.y;
    pdf.font('Helvetica-Bold').text(String(data.nom_demandeur || 'Demandeur'), 48, signatureY, { width: signatureWidth });
    pdf.font('Helvetica').text(profile, 48, signatureY + 15, { width: signatureWidth });
    pdf.moveTo(48, signatureY + 100).lineTo(48 + signatureWidth, signatureY + 100).strokeColor('#52616b').stroke();
    pdf.text('Signature', 48, signatureY + 105, { width: signatureWidth, align: 'center' });
    pdf.font('Helvetica-Bold').text(String(data.nom_autre_partie || 'Autre partie'), 317, signatureY, { width: signatureWidth });
    pdf.font('Helvetica').text(otherRole, 317, signatureY + 15, { width: signatureWidth });
    pdf.moveTo(317, signatureY + 100).lineTo(547, signatureY + 100).strokeColor('#52616b').stroke();
    pdf.text('Signature', 317, signatureY + 105, { width: signatureWidth, align: 'center' });
    pdf.moveDown(9);
    pdf.fontSize(8).fillColor('#667085').text('Document généré à partir des informations saisies par les parties. Les parties doivent vérifier son contenu avant signature.');

    const pages = pdf.bufferedPageRange();
    for (let pageIndex = pages.start; pageIndex < pages.start + pages.count; pageIndex += 1) {
      pdf.switchToPage(pageIndex);
      const footerY = pdf.page.height - 43;
      pdf.save();
      pdf.moveTo(48, footerY - 5).lineTo(pdf.page.width - 48, footerY - 5).strokeColor('#d6dde3').stroke();
      pdf.font('Helvetica').fontSize(8).fillColor('#52616b')
        .text(`Acheteur : ${String(data.nom_demandeur || '—')} · Référence de transaction : ${reference}`, 48, footerY, {
          width: pdf.page.width - 96,
          height: 20,
          align: 'center',
          lineBreak: false,
      });
      pdf.restore();
    }
    pdf.end();
  });
}

function postScriptString(value) {
  return String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

async function createPdfaArchive(document) {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-document-'));
  const inputPath = path.join(temporaryDirectory, 'source.pdf');
  const outputPath = path.join(temporaryDirectory, 'archive.pdf');
  const definitionPath = path.join(temporaryDirectory, 'pdfa-definition.ps');
  const iccProfile = process.env.PDF_A_ICC_PROFILE || '/usr/share/color/icc/ghostscript/default_rgb.icc';
  const mark = `Acheteur : ${document.buyer || '—'} · Transaction : ${document.transaction || '—'}`;
  const prefix = [
    '%!',
    `/ICCProfile (${postScriptString(iccProfile)}) def`,
    '[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark',
    '[{icc_PDFA} << /N 3 >> /PUT pdfmark',
    '[{icc_PDFA} ICCProfile (r) file /PUT pdfmark',
    '[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark',
    '[{OutputIntent_PDFA} <<',
    '/Type /OutputIntent',
    '/S /GTS_PDFA1',
    '/OutputConditionIdentifier (sRGB IEC61966-2.1)',
    '/Info (sRGB IEC61966-2.1)',
    '/RegistryName (http://www.color.org)',
    '/DestOutputProfile {icc_PDFA}',
    '>> /PUT pdfmark',
    '[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark',
    `<< /EndPage { pop pop gsave /Helvetica findfont 8 scalefont setfont 0.35 setgray 36 18 moveto (${postScriptString(mark)}) show grestore true } bind >> setpagedevice`,
  ].join('\n');

  try {
    await fs.promises.access(iccProfile, fs.constants.R_OK);
    await fs.promises.writeFile(inputPath, document.sourcePdfBuffer || await documentPdfBuffer(document), { mode: 0o600 });
    await fs.promises.writeFile(definitionPath, prefix, { mode: 0o600 });
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
  await fs.promises.mkdir(DOCUMENT_ARCHIVES_DIR, { recursive: true, mode: 0o700 });
  const archive = await createPdfaArchive(document);
  const filename = `${crypto.randomBytes(20).toString('hex')}.pdf`;
  const archivePath = path.join(DOCUMENT_ARCHIVES_DIR, filename);
  await fs.promises.writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
  return {
    filename,
    sha256: crypto.createHash('sha256').update(archive).digest('hex'),
  };
}

async function createEncryptedTemplatePdf(sourcePdf, password, ownerPassword) {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-protected-'));
  const inputPath = path.join(temporaryDirectory, 'source.pdf');
  const outputPath = path.join(temporaryDirectory, 'protected.pdf');
  try {
    await fs.promises.writeFile(inputPath, sourcePdf, { mode: 0o600 });
    await execFileAsync(process.env.GS_BIN || 'gs', [
      '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
      '-dEncryptionR=3', '-dKeyLength=128', '-dPermissions=-4',
      `-sUserPassword=${password}`, `-sOwnerPassword=${ownerPassword}`,
      `-sOutputFile=${outputPath}`, inputPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const output = await fs.promises.readFile(outputPath);
    if (!output.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Ghostscript n’a pas produit le PDF protégé.');
    return output;
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function renderPreviewPages(pdfBuffer, watermark = 'APERÇU Coloc KOO') {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'colockoo-preview-'));
  const inputPath = path.join(directory, 'preview.pdf');
  const outputPattern = path.join(directory, 'page-%03d.png');

  try {
    await fs.promises.writeFile(inputPath, pdfBuffer, { mode: 0o600 });
    await execFileAsync(process.env.GS_BIN || 'gs', [
      '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
      '-sDEVICE=png16m', '-r120', `-sOutputFile=${outputPattern}`,
      '-c', `<< /EndPage { pop pop gsave /Helvetica findfont 9 scalefont setfont 0.45 setgray 36 18 moveto (${postScriptString(watermark)}) show grestore true } bind >> setpagedevice`,
      '-f', inputPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });

    const files = (await fs.promises.readdir(directory))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort();
    if (!files.length) throw new Error('Ghostscript n’a rendu aucune page pour l’aperçu PDF.');
    return await Promise.all(files.slice(0, 2).map(async (name) =>
      (await fs.promises.readFile(path.join(directory, name))).toString('base64')
    ));
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function createDraft(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const { type_document: type, template_id: templateId, profil_demandeur: profile, donnees: data, clauses_ids: clauseIds } = req.body;
    if (!['contrat', 'edl'].includes(type)) return res.status(400).json({ message: 'Type de document invalide.' });
    if (!PROFILE_ROLES.has(profile)) return res.status(400).json({ message: 'Profil demandeur invalide.' });
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ message: 'Les informations du document sont requises.' });
    const resolvedTemplateId = templateId || (type === 'edl' ? 'etat_des_lieux' : undefined);
    const missing = validateData(type, profile, data, resolvedTemplateId);
    if (missing.length) return res.status(400).json({ message: `Champs obligatoires manquants : ${missing.join(', ')}.` });
    const clauses = await getSelectedClauses(clauseIds);
    const montant = await resolvePrice(type);
    const encryptedData = await encryptRequestData(data);
    const id = await insertAndGetId(
      `INSERT INTO demandes_documents_contractuels
        (reference, id_utilisateur, type_document, template_id, profil_demandeur, donnees, clauses_ids, clauses_snapshot,
         archive_filename, archive_sha256, archive_generated_at, montant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        `DOC-${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        currentUserId(req),
        type,
        resolvedTemplateId,
        profile,
        encryptedData,
        JSON.stringify(clauses.map((clause) => clause.id_clause)),
        JSON.stringify(clauses),
        null,
        null,
        montant,
      ]
    );
    const rows = await query('SELECT reference FROM demandes_documents_contractuels WHERE id_demande = ?', [id]);
    res.status(201).json({ id, reference: rows[0].reference, montant });
  } catch (err) { next(err); }
}

async function preview(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const { type_document: type, template_id: templateId, profil_demandeur: profile, donnees: data } = req.body;
    if (!['contrat', 'edl'].includes(type) || !PROFILE_ROLES.has(profile) || !data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ message: 'Informations d’aperçu invalides.' });
    }
    const resolvedTemplateId = templateId || (type === 'edl' ? 'etat_des_lieux' : undefined);
    const missing = validateData(type, profile, data, resolvedTemplateId);
    if (missing.length) return res.status(400).json({ message: `Champs obligatoires manquants : ${missing.join(', ')}.` });
    const rendered = await renderContratsImmoPdf({
      type,
      templateId: resolvedTemplateId,
      profile,
      data,
      reference: 'APERÇU',
      templateEdits: await getActiveTemplateEdits(),
    });
    // Le navigateur reçoit des pages image, pas le PDF éditable ni une visionneuse native.
    const pages = await renderPreviewPages(rendered.pdfBuffer, `APERÇU - ${data.nom_demandeur || data.demandeur_nom_complet || 'Coloc KOO'}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ pages });
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const rows = await query(
      `SELECT id_demande, reference, type_document, template_id, profil_demandeur, donnees, clauses_ids, client_deleted,
              montant, statut, statut_paiement, moyen_paiement, preuve_paiement, date_creation
         FROM demandes_documents_contractuels
        WHERE id_utilisateur = ?
        ORDER BY date_creation DESC
        LIMIT 100`,
      [currentUserId(req)]
    );
    res.json(rows.filter((row) => !row.client_deleted).map(({ preuve_paiement: proof, ...row }) => ({
      ...row,
      donnees: {},
      clauses_ids: parseJson(row.clauses_ids, []),
      has_payment_proof: Boolean(proof),
    })));
  } catch (err) {
    next(err);
  }
}

async function deleteMine(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    const rows = await query('SELECT autorisation_filename, mandat_filename, preuve_paiement FROM demandes_documents_contractuels WHERE id_demande = ? AND id_utilisateur = ? AND client_deleted = 0 LIMIT 1', [id, currentUserId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    const result = await query(
      'UPDATE demandes_documents_contractuels SET client_deleted = 1, donnees = ?, download_token_hash = NULL, download_token_expires_at = NULL, autorisation_filename = NULL, mandat_filename = NULL, preuve_paiement = NULL WHERE id_demande = ? AND id_utilisateur = ? AND client_deleted = 0',
      [JSON.stringify({}), id, currentUserId(req)]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Demande introuvable.' });
    for (const filename of [rows[0].autorisation_filename, rows[0].mandat_filename]) {
      if (/^[a-f0-9]{40}\.pdf$/.test(filename || '')) {
        await fs.promises.unlink(path.join(DOCUMENT_ANNEXES_DIR, filename)).catch(() => {});
      }
    }
    if (/^[a-f0-9]{40}\.(png|jpg|webp)$/.test(rows[0].preuve_paiement || '')) {
      await fs.promises.unlink(path.join(PAYMENT_PROOFS_DIR, rows[0].preuve_paiement)).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function uploadSignedAnnex(req, res, next) {
  let savedPath;
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    const annexType = req.params.type;
    if (!Number.isInteger(id) || id <= 0 || !['autorisation', 'mandat'].includes(annexType)) {
      return res.status(400).json({ message: 'Demande ou type d’annexe invalide.' });
    }
    if (!Buffer.isBuffer(req.file?.buffer) || req.file.buffer.length < 8 || req.file.buffer.toString('ascii', 0, 5) !== '%PDF-') {
      return res.status(400).json({ message: 'Joignez un fichier PDF valide.' });
    }
    const rows = await query(
      `SELECT id_demande, type_document, profil_demandeur, template_id, statut, autorisation_filename, mandat_filename
         FROM demandes_documents_contractuels WHERE id_demande = ? AND id_utilisateur = ? LIMIT 1`,
      [id, currentUserId(req)]
    );
    const request = rows[0];
    if (!request) return res.status(404).json({ message: 'Demande introuvable.' });
    if (request.statut !== 'brouillon') return res.status(409).json({ message: 'Les annexes ne peuvent être modifiées après le début du paiement.' });
    const allowed = annexType === 'autorisation'
      ? request.template_id === 'contrat_intercolocs' && request.profil_demandeur === 'locataire'
      : request.template_id === 'contrat_mandacolocs' && request.profil_demandeur === 'professionnel';
    if (!allowed) return res.status(400).json({ message: 'Cette annexe ne correspond pas au contrat sélectionné.' });
    await fs.promises.mkdir(DOCUMENT_ANNEXES_DIR, { recursive: true, mode: 0o700 });
    const filename = `${crypto.randomBytes(20).toString('hex')}.pdf`;
    savedPath = path.join(DOCUMENT_ANNEXES_DIR, filename);
    await fs.promises.writeFile(savedPath, req.file.buffer, { flag: 'wx', mode: 0o600 });
    const column = annexType === 'autorisation' ? 'autorisation_filename' : 'mandat_filename';
    const result = await query(`UPDATE demandes_documents_contractuels SET ${column} = ? WHERE id_demande = ? AND id_utilisateur = ? AND statut = 'brouillon'`, [filename, id, currentUserId(req)]);
    if (!result.affectedRows) {
      const error = new Error('La demande n’est plus modifiable.');
      error.status = 409;
      throw error;
    }
    const previous = annexType === 'autorisation' ? request.autorisation_filename : request.mandat_filename;
    if (/^[a-f0-9]{40}\.pdf$/.test(previous || '')) {
      await fs.promises.unlink(path.join(DOCUMENT_ANNEXES_DIR, previous)).catch(() => {});
    }
    savedPath = null;
    res.status(201).json({ ok: true, type: annexType });
  } catch (err) {
    if (savedPath) await fs.promises.unlink(savedPath).catch(() => {});
    next(err);
  }
}

async function submitPayment(req, res, next) {
  let savedProofPath;
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    const { moyen_paiement: method, reference_operateur: operatorReference } = req.body;
    const reference = String(operatorReference || '').trim();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    if (reference.length < 4 || reference.length > 255) {
      return res.status(400).json({ message: 'La référence Mobile Money doit contenir entre 4 et 255 caractères.' });
    }
    const configuredMethods = await getConfigValue('MOBILE_MONEY', []);
    const allowedMethods = Array.isArray(configuredMethods) ? configuredMethods.map((item) => item.nom) : [];
    if (!allowedMethods.includes(method)) return res.status(400).json({ message: 'Moyen de paiement non configuré.' });
    const isMvola = /mvola/i.test(method);
    if (isMvola && !req.file) {
      return res.status(400).json({ message: 'Joignez la capture du message de confirmation MVola pour permettre la vérification.' });
    }
    const rows = await query(
      'SELECT id_demande, reference, type_document, template_id, profil_demandeur, statut, montant, autorisation_filename, mandat_filename FROM demandes_documents_contractuels WHERE id_demande = ? AND id_utilisateur = ? LIMIT 1',
      [id, currentUserId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    if (rows[0].statut !== 'brouillon') return res.status(409).json({ message: 'Le paiement de cette demande a déjà été soumis.' });
    if (rows[0].template_id === 'contrat_intercolocs' && rows[0].profil_demandeur === 'locataire' && !rows[0].autorisation_filename) {
      return res.status(400).json({ message: 'Ajoutez l’Autorisation de colocation signée avant le paiement.' });
    }
    if (rows[0].template_id === 'contrat_mandacolocs' && rows[0].profil_demandeur === 'professionnel' && !rows[0].mandat_filename) {
      return res.status(400).json({ message: 'Ajoutez le Mandat de gestion signé avant le paiement.' });
    }
    for (const filename of [rows[0].autorisation_filename, rows[0].mandat_filename]) {
      if (filename) {
        if (!/^[a-f0-9]{40}\.pdf$/.test(filename)) {
          return res.status(409).json({ message: 'Une annexe signée est introuvable. Ajoutez-la de nouveau avant le paiement.' });
        }
        try {
          await fs.promises.access(path.join(DOCUMENT_ANNEXES_DIR, filename));
        } catch (error) {
          if (error.code === 'ENOENT') return res.status(409).json({ message: 'Une annexe signée est introuvable. Ajoutez-la de nouveau avant le paiement.' });
          throw error;
        }
      }
    }
    const duplicateReferences = await query(
      `SELECT id_demande FROM demandes_documents_contractuels
        WHERE LOWER(moyen_paiement) = LOWER(?) AND LOWER(reference_operateur) = LOWER(?)
          AND id_demande <> ? LIMIT 1`,
      [method, reference, id]
    );
    if (duplicateReferences.length) {
      return res.status(409).json({ message: 'Cette référence de paiement a déjà été soumise.' });
    }

    let proofFilename = null;
    if (req.file) {
      const format = getImageFormat(req.file.buffer);
      if (!format || req.file.mimetype !== format.mime) {
        return res.status(400).json({ message: 'La capture doit être une image PNG, JPEG ou WebP valide.' });
      }
      await fs.promises.mkdir(PAYMENT_PROOFS_DIR, { recursive: true });
      proofFilename = `${crypto.randomBytes(20).toString('hex')}.${format.extension}`;
      savedProofPath = path.join(PAYMENT_PROOFS_DIR, proofFilename);
      await fs.promises.writeFile(savedProofPath, req.file.buffer, { flag: 'wx' });
    }
    const updateResult = await query(
      `UPDATE demandes_documents_contractuels
          SET statut = 'a-verifier', statut_paiement = 'a-verifier',
              moyen_paiement = ?, reference_operateur = ?, preuve_paiement = ?
        WHERE id_demande = ? AND id_utilisateur = ? AND statut = 'brouillon'`,
      [method, reference, proofFilename, id, currentUserId(req)]
    );
    if (!updateResult.affectedRows) {
      const error = new Error('Le paiement de cette demande a déjà été soumis.');
      error.status = 409;
      throw error;
    }
    savedProofPath = null;
    res.status(201).json({ message: 'Paiement soumis à vérification.', reference: rows[0].reference, montant: rows[0].montant });
  } catch (err) {
    if (savedProofPath) {
      try {
        await fs.promises.unlink(savedProofPath);
      } catch (cleanupError) {
        console.error('Impossible de supprimer la capture de paiement après une erreur :', cleanupError);
      }
    }
    next(err);
  }
}

function getImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
}

async function getBackofficePaymentProof(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    const rows = await query(
      'SELECT preuve_paiement FROM demandes_documents_contractuels WHERE id_demande = ? LIMIT 1',
      [id]
    );
    const filename = rows[0]?.preuve_paiement;
    if (!filename || !/^[a-f0-9]{40}\.(png|jpg|webp)$/.test(filename)) {
      return res.status(404).json({ message: 'Aucune capture de paiement disponible.' });
    }
    const extension = path.extname(filename).slice(1);
    res.set('Cache-Control', 'private, no-store');
    res.type(extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);
    res.sendFile(path.join(PAYMENT_PROOFS_DIR, filename), (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

async function getBackofficeDocumentPreview(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    const rows = await query(
      'SELECT reference, archive_filename, archive_sha256 FROM demandes_documents_contractuels WHERE id_demande = ? LIMIT 1',
      [id]
    );
    const row = rows[0];
    if (!row || !/^[a-f0-9]{40}\.pdf$/.test(row.archive_filename || '') || !/^[a-f0-9]{64}$/.test(row.archive_sha256 || '')) {
      return res.status(404).json({ message: 'Document généré introuvable.' });
    }
    const pdf = await fs.promises.readFile(path.join(DOCUMENT_ARCHIVES_DIR, row.archive_filename));
    if (crypto.createHash('sha256').update(pdf).digest('hex') !== row.archive_sha256) {
      return res.status(500).json({ message: 'Le document ne correspond pas à son empreinte enregistrée.' });
    }
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${row.reference.replace(/[^A-Za-z0-9_-]/g, '')}.pdf"`,
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

async function getDocument(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    const rows = await query(
      `SELECT id_demande, reference, type_document, template_id, profil_demandeur, donnees,
              clauses_ids, clauses_snapshot, statut, statut_paiement,
              archive_filename, archive_sha256
         FROM demandes_documents_contractuels
        WHERE id_demande = ? AND id_utilisateur = ? LIMIT 1`,
      [id, currentUserId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    const document = rows[0];
    if (document.statut !== 'valide' || document.statut_paiement !== 'conforme') {
      return res.status(403).json({ message: 'Le document sera disponible après validation du paiement par notre équipe.' });
    }
    if (!/^[a-f0-9]{40}\.pdf$/.test(document.archive_filename || '') || !/^[a-f0-9]{64}$/.test(document.archive_sha256 || '')) {
      return res.status(503).json({ message: 'L’archive du document n’est pas disponible. Contacte l’équipe Coloc’KOO.' });
    }
    const archivePath = path.join(DOCUMENT_ARCHIVES_DIR, document.archive_filename);
    const archive = await fs.promises.readFile(archivePath);
    const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
    if (actualHash !== document.archive_sha256) {
      return res.status(500).json({ message: 'L’empreinte de l’archive ne correspond pas. Le téléchargement est suspendu pour vérification.' });
    }
    const deliveryHash = actualHash;
    await query(
      `INSERT INTO empreintes_documents_contractuels
        (id_demande, id_utilisateur, type_pdf, sha256)
       VALUES (?, ?, 'pdf_livre', ?)`,
      [document.id_demande, currentUserId(req), deliveryHash]
    );
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${document.reference.replace(/[^A-Za-z0-9_-]/g, '')}.pdf"`,
      'Content-Length': archive.length,
    });
    res.send(archive);
  } catch (err) {
    next(err);
  }
}

async function createDownloadLink(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    const rows = await query(
      `SELECT id_demande FROM demandes_documents_contractuels
        WHERE id_demande = ? AND id_utilisateur = ? AND client_deleted = 0
          AND statut = 'valide' AND statut_paiement = 'conforme'
          AND archive_filename IS NOT NULL AND archive_sha256 IS NOT NULL LIMIT 1`,
      [id, currentUserId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Document validé introuvable.' });
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query(
      'UPDATE demandes_documents_contractuels SET download_token_hash = ?, download_token_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) WHERE id_demande = ?',
      [tokenHash, id]
    );
    res.json({ token, expires_in_seconds: 900 });
  } catch (err) { next(err); }
}

async function downloadByToken(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return res.status(404).json({ message: 'Lien de téléchargement invalide ou expiré.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await query(
      `SELECT id_demande, id_utilisateur, reference, archive_filename, archive_sha256
         FROM demandes_documents_contractuels
        WHERE download_token_hash = ? AND download_token_expires_at > UTC_TIMESTAMP()
          AND client_deleted = 0 AND statut = 'valide' AND statut_paiement = 'conforme' LIMIT 1`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row || !/^[a-f0-9]{40}\.pdf$/.test(row.archive_filename || '') || !/^[a-f0-9]{64}$/.test(row.archive_sha256 || '')) {
      return res.status(404).json({ message: 'Lien de téléchargement invalide ou expiré.' });
    }
    const archive = await fs.promises.readFile(path.join(DOCUMENT_ARCHIVES_DIR, row.archive_filename));
    if (crypto.createHash('sha256').update(archive).digest('hex') !== row.archive_sha256) {
      return res.status(500).json({ message: 'L’empreinte de l’archive ne correspond pas.' });
    }
    await query(
      `INSERT INTO empreintes_documents_contractuels (id_demande, id_utilisateur, type_pdf, sha256)
       VALUES (?, ?, 'pdf_livre', ?)`,
      [row.id_demande, row.id_utilisateur, row.archive_sha256]
    );
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.reference.replace(/[^A-Za-z0-9_-]/g, '')}.pdf"`,
      'Content-Length': archive.length,
    });
    res.send(archive);
  } catch (err) { next(err); }
}

async function listBackoffice(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const [rows, clauseRows] = await Promise.all([
      query(
      `SELECT d.*, u.nom, u.prenom, u.email
           FROM demandes_documents_contractuels d
           LEFT JOIN utilisateurs u ON u.id_utilisateur = d.id_utilisateur
          WHERE d.client_deleted = 0
          ORDER BY CASE WHEN d.statut = 'valide' AND d.statut_paiement = 'conforme' THEN 0 ELSE 1 END,
                   d.date_creation DESC
          LIMIT 500`
      ),
      query('SELECT id_clause, titre, description FROM contrat_clauses'),
    ]);
    const clausesById = new Map(clauseRows.map((clause) => [Number(clause.id_clause), clause]));
    res.json(await Promise.all(rows.map(async (row) => ({
      ...(({
        preuve_paiement: _proof,
        archive_filename: _archiveFilename,
        archive_sha256: _archiveHash,
        archive_generated_at: _archiveGeneratedAt,
        autorisation_filename: _authorizationFilename,
        mandat_filename: _managementMandateFilename,
        ...safeRow
      }) => safeRow)(row),
      donnees: await decryptRequestData(row.donnees),
      clauses_ids: parseJson(row.clauses_ids, []),
      has_payment_proof: Boolean(row.preuve_paiement),
      has_archive: Boolean(row.archive_filename && row.archive_sha256),
      clauses: parseJson(row.clauses_snapshot, null) ||
        parseJson(row.clauses_ids, []).map((id) => clausesById.get(Number(id))).filter(Boolean),
    }))));
  } catch (err) {
    next(err);
  }
}

async function listBackofficeClauses(req, res, next) {
  try {
    await ensureContractContent();
    const rows = await query(
      'SELECT id_clause, titre, description, ordre, est_actif FROM contrat_clauses ORDER BY ordre, id_clause'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createBackofficeClause(req, res, next) {
  try {
    await ensureContractContent();
    const { titre, description, ordre } = req.body;
    if (!String(titre || '').trim()) return res.status(400).json({ message: 'Le titre de la clause est requis.' });
    const result = await query(
      'INSERT INTO contrat_clauses (titre, description, ordre, est_actif) VALUES (?, ?, ?, 1)',
      [String(titre).trim(), String(description || '').trim() || null, Number(ordre) || 0]
    );
    res.status(201).json({ id_clause: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateBackofficeClause(req, res, next) {
  try {
    await ensureContractContent();
    const id = Number(req.params.id);
    const { titre, description, ordre, est_actif: isActive } = req.body;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Clause invalide.' });
    if (!String(titre || '').trim()) return res.status(400).json({ message: 'Le titre de la clause est requis.' });
    const result = await query(
      'UPDATE contrat_clauses SET titre = ?, description = ?, ordre = ?, est_actif = ? WHERE id_clause = ?',
      [String(titre).trim(), String(description || '').trim() || null, Number(ordre) || 0, isActive === false || Number(isActive) === 0 ? 0 : 1, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Clause introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function updateBackoffice(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    const { statut } = req.body;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    if (!['en-cours', 'valide', 'refuse'].includes(statut)) {
      return res.status(400).json({ message: 'Statut de demande invalide.' });
    }
    const rows = await query('SELECT * FROM demandes_documents_contractuels WHERE id_demande = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    const request = rows[0];
    if (request.client_deleted) return res.status(404).json({ message: 'Demande introuvable.' });
    if (statut === 'valide' && !['a-verifier', 'en-cours', 'valide'].includes(request.statut)) {
      return res.status(409).json({ message: 'Le paiement doit être soumis puis vérifié avant de valider le document.' });
    }
    if (statut === 'valide' && request.statut !== 'valide' && request.statut_paiement !== 'a-verifier') {
      return res.status(409).json({ message: 'Le paiement doit être confirmé par l’équipe avant de générer le document final.' });
    }
    let savedArchive;
    let archive;
    if (statut === 'valide') {
      if (request.statut === 'valide' && /^[a-f0-9]{40}\.pdf$/.test(request.archive_filename || '') && /^[a-f0-9]{64}$/.test(request.archive_sha256 || '')) {
        try {
          const existingArchive = await fs.promises.readFile(path.join(DOCUMENT_ARCHIVES_DIR, request.archive_filename));
          const existingHash = crypto.createHash('sha256').update(existingArchive).digest('hex');
          if (existingHash === request.archive_sha256) {
            archive = { filename: request.archive_filename, sha256: existingHash };
          }
        } catch (archiveError) {
          if (archiveError.code !== 'ENOENT') throw archiveError;
        }
      }
      if (!archive) {
        const rendered = await renderContratsImmoPdf({
          reference: request.reference,
          type: request.type_document,
          templateId: request.template_id,
          profile: request.profil_demandeur,
          data: await decryptRequestData(request.donnees),
          templateEdits: await getActiveTemplateEdits(),
          annexes: await Promise.all([
            request.mandat_filename && fs.promises.readFile(path.join(DOCUMENT_ANNEXES_DIR, request.mandat_filename))
              .then((pdfBuffer) => ({ title: 'ANNEXE 0 : MANDAT DE GESTION', pdfBuffer })),
            request.autorisation_filename && fs.promises.readFile(path.join(DOCUMENT_ANNEXES_DIR, request.autorisation_filename))
              .then((pdfBuffer) => ({ title: 'AUTORISATION DE COLOCATION', pdfBuffer })),
          ].filter(Boolean)),
        });
        const buyerRows = await query('SELECT prenom, nom FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1', [request.id_utilisateur]);
        archive = await savePdfaArchive({
          sourcePdfBuffer: rendered.pdfBuffer,
          buyer: [buyerRows[0]?.prenom, buyerRows[0]?.nom].filter(Boolean).join(' '),
          transaction: request.reference_operateur || request.reference,
        });
        savedArchive = archive.filename;
      }
    }

    try {
      await query(
        `UPDATE demandes_documents_contractuels
            SET statut = ?,
                statut_paiement = CASE
                  WHEN ? = 'valide' THEN 'conforme'
                  WHEN ? = 'refuse' THEN 'non-conforme'
                  ELSE statut_paiement
                END,
                archive_filename = ?,
                archive_sha256 = ?,
                donnees = CASE WHEN ? IN ('valide', 'refuse') THEN JSON_OBJECT() ELSE donnees END,
                archive_generated_at = CASE
                  WHEN ? = 'refuse' THEN NULL
                  WHEN ? = 'valide' AND ? = 1 THEN CURRENT_TIMESTAMP
                  WHEN ? = 'valide' THEN COALESCE(archive_generated_at, CURRENT_TIMESTAMP)
                  ELSE archive_generated_at
                END,
                autorisation_filename = CASE WHEN ? IN ('valide', 'refuse') THEN NULL ELSE autorisation_filename END,
                mandat_filename = CASE WHEN ? IN ('valide', 'refuse') THEN NULL ELSE mandat_filename END,
                preuve_paiement = CASE WHEN ? IN ('valide', 'refuse') THEN NULL ELSE preuve_paiement END
          WHERE id_demande = ?`,
        [
          statut,
          statut,
          statut,
          statut === 'refuse' ? null : archive?.filename || request.archive_filename || null,
          statut === 'refuse' ? null : archive?.sha256 || request.archive_sha256 || null,
          statut,
          statut,
          statut,
          savedArchive ? 1 : 0,
          statut,
          statut,
          statut,
          statut,
          id,
        ]
      );
      if (['valide', 'refuse'].includes(statut)) {
        for (const filename of [request.autorisation_filename, request.mandat_filename]) {
          if (/^[a-f0-9]{40}\.pdf$/.test(filename || '')) {
            await fs.promises.unlink(path.join(DOCUMENT_ANNEXES_DIR, filename)).catch(() => {});
          }
        }
        if (/^[a-f0-9]{40}\.(png|jpg|webp)$/.test(request.preuve_paiement || '')) {
          await fs.promises.unlink(path.join(PAYMENT_PROOFS_DIR, request.preuve_paiement)).catch(() => {});
        }
      }
    } catch (updateError) {
      if (savedArchive) {
        await fs.promises.unlink(path.join(DOCUMENT_ARCHIVES_DIR, savedArchive)).catch((cleanupError) => {
          console.error('Impossible de supprimer une archive PDF/A non enregistrée :', cleanupError);
        });
      }
      throw updateError;
    }
    if (statut === 'refuse' && /^[a-f0-9]{40}\.pdf$/.test(request.archive_filename || '')) {
      await fs.promises.unlink(path.join(DOCUMENT_ARCHIVES_DIR, request.archive_filename)).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') console.error('Impossible de supprimer le PDF d’une demande refusée :', cleanupError);
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createDraft,
  uploadSignedAnnex,
  preview,
  listMine,
  deleteMine,
  submitPayment,
  getDocument,
  createDownloadLink,
  downloadByToken,
  listBackoffice,
  listBackofficeTemplates,
  saveBackofficeTemplate,
  listBackofficeClauses,
  createBackofficeClause,
  updateBackofficeClause,
  updateBackoffice,
  getBackofficePaymentProof,
  getBackofficeDocumentPreview,
  validateData,
  documentHtml,
  getImageFormat,
  documentPdfBuffer,
  createPdfaArchive,
};
