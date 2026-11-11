const { query, insertAndGetId } = require('../Services/db.service');
const { ensureContractContent, getConfigValue } = require('./meta.controller');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROFILE_ROLES = new Set(['locataire', 'proprietaire', 'professionnel']);
const PAYMENT_PROOFS_DIR = path.join(__dirname, '..', '..', 'private_uploads', 'document-payment-proofs');

async function ensureDocumentRequestsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS demandes_documents_contractuels (
      id_demande INT NOT NULL AUTO_INCREMENT,
      reference VARCHAR(32) NOT NULL,
      id_utilisateur INT NOT NULL,
      type_document ENUM('contrat','edl') NOT NULL,
      profil_demandeur VARCHAR(30) NOT NULL,
      donnees JSON NOT NULL,
      clauses_ids JSON NULL,
      clauses_snapshot JSON NULL,
      preuve_paiement VARCHAR(80) NULL,
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

function validateData(type, profile, data) {
  const required = [
    'adresse', 'ville', 'type_bien', 'nom_demandeur', 'telephone_demandeur',
    'email_demandeur', 'nom_autre_partie', 'telephone_autre_partie',
    'email_autre_partie', 'date_entree',
  ];
  if (type === 'contrat') required.push('loyer');
  if (profile === 'professionnel') required.push('nom_entreprise', 'representant');
  const invalid = Object.entries(data || {})
    .filter(([key, value]) => typeof value !== 'string' || value.length > 4000)
    .map(([key]) => key);
  const missing = required.filter((key) => !String(data?.[key] ?? '').trim());
  const invalidIdentityFields = [];
  for (const key of ['cin_demandeur', 'cin_autre_partie']) {
    const value = String(data?.[key] ?? '');
    if (value && !/^\d{1,12}$/.test(value)) invalidIdentityFields.push(key);
  }
  for (const key of ['telephone_demandeur', 'telephone_autre_partie']) {
    const value = String(data?.[key] ?? '');
    if (value && !/^\+?\d{1,13}$/.test(value)) invalidIdentityFields.push(key);
  }
  return [...new Set([...missing, ...invalid, ...invalidIdentityFields])];
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

async function createDraft(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const { type_document: type, profil_demandeur: profile, donnees: data, clauses_ids: clauseIds } = req.body;
    if (!['contrat', 'edl'].includes(type)) return res.status(400).json({ message: 'Type de document invalide.' });
    if (!PROFILE_ROLES.has(profile)) return res.status(400).json({ message: 'Profil demandeur invalide.' });
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ message: 'Les informations du document sont requises.' });
    const missing = validateData(type, profile, data);
    if (missing.length) return res.status(400).json({ message: `Champs obligatoires manquants : ${missing.join(', ')}.` });
    const clauses = await getSelectedClauses(clauseIds);
    const montant = await resolvePrice(type);
    const id = await insertAndGetId(
      `INSERT INTO demandes_documents_contractuels
        (reference, id_utilisateur, type_document, profil_demandeur, donnees, clauses_ids, clauses_snapshot, montant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `DOC-${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        currentUserId(req),
        type,
        profile,
        JSON.stringify(data),
        JSON.stringify(clauses.map((clause) => clause.id_clause)),
        JSON.stringify(clauses),
        montant,
      ]
    );
    const rows = await query('SELECT reference FROM demandes_documents_contractuels WHERE id_demande = ?', [id]);
    res.status(201).json({ id, reference: rows[0].reference, montant });
  } catch (err) {
    next(err);
  }
}

async function preview(req, res, next) {
  try {
    await ensureContractContent();
    const { type_document: type, profil_demandeur: profile, donnees: data, clauses_ids: clauseIds } = req.body;
    if (!['contrat', 'edl'].includes(type) || !PROFILE_ROLES.has(profile) || !data || typeof data !== 'object') {
      return res.status(400).json({ message: 'Informations d’aperçu invalides.' });
    }
    const missing = validateData(type, profile, data);
    if (missing.length) return res.status(400).json({ message: `Champs obligatoires manquants : ${missing.join(', ')}.` });
    const clauses = await getSelectedClauses(clauseIds);
    res.type('html').send(documentHtml({
      reference: 'APERÇU',
      type,
      profile,
      data,
      clauses,
      preview: true,
    }));
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    await ensureDocumentRequestsSchema();
    const rows = await query(
      `SELECT id_demande, reference, type_document, profil_demandeur, donnees, clauses_ids,
              montant, statut, statut_paiement, moyen_paiement, preuve_paiement, date_creation
         FROM demandes_documents_contractuels
        WHERE id_utilisateur = ?
        ORDER BY CASE WHEN statut = 'valide' AND statut_paiement = 'conforme' THEN 0 ELSE 1 END,
                 date_creation DESC
        LIMIT 100`,
      [currentUserId(req)]
    );
    res.json(rows.map(({ preuve_paiement: proof, ...row }) => ({
      ...row,
      donnees: parseJson(row.donnees, {}),
      clauses_ids: parseJson(row.clauses_ids, []),
      has_payment_proof: Boolean(proof),
    })));
  } catch (err) {
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
      'SELECT id_demande, reference, statut, montant FROM demandes_documents_contractuels WHERE id_demande = ? AND id_utilisateur = ? LIMIT 1',
      [id, currentUserId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    if (rows[0].statut !== 'brouillon') return res.status(409).json({ message: 'Le paiement de cette demande a déjà été soumis.' });
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

async function getDocument(req, res, next) {
  try {
    await ensureContractContent();
    await ensureDocumentRequestsSchema();
    const rows = await query(
      'SELECT * FROM demandes_documents_contractuels WHERE id_demande = ? AND id_utilisateur = ? LIMIT 1',
      [req.params.id, currentUserId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable.' });
    const document = rows[0];
    if (document.statut !== 'valide' || document.statut_paiement !== 'conforme') {
      return res.status(403).json({ message: 'Le document sera disponible après validation du paiement par notre équipe.' });
    }
    const data = parseJson(document.donnees, {});
    const snapshot = parseJson(document.clauses_snapshot, null);
    const clauses = Array.isArray(snapshot)
      ? snapshot
      : await getSelectedClauses(parseJson(document.clauses_ids, []));
    res.type('html').send(documentHtml({
      reference: document.reference,
      type: document.type_document,
      profile: document.profil_demandeur,
      data,
      clauses,
    }));
  } catch (err) {
    next(err);
  }
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
          ORDER BY CASE WHEN d.statut = 'valide' AND d.statut_paiement = 'conforme' THEN 0 ELSE 1 END,
                   d.date_creation DESC
          LIMIT 500`
      ),
      query('SELECT id_clause, titre, description FROM contrat_clauses'),
    ]);
    const clausesById = new Map(clauseRows.map((clause) => [Number(clause.id_clause), clause]));
    res.json(rows.map((row) => ({
      ...(({ preuve_paiement: _proof, ...safeRow }) => safeRow)(row),
      donnees: parseJson(row.donnees, {}),
      clauses_ids: parseJson(row.clauses_ids, []),
      has_payment_proof: Boolean(row.preuve_paiement),
      clauses: parseJson(row.clauses_snapshot, null) ||
        parseJson(row.clauses_ids, []).map((id) => clausesById.get(Number(id))).filter(Boolean),
    })));
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
    await ensureDocumentRequestsSchema();
    const id = Number(req.params.id);
    const { statut } = req.body;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Demande invalide.' });
    if (!['en-cours', 'valide', 'refuse'].includes(statut)) {
      return res.status(400).json({ message: 'Statut de demande invalide.' });
    }
    const result = await query(
      `UPDATE demandes_documents_contractuels
          SET statut = ?,
              statut_paiement = CASE
                WHEN ? = 'valide' THEN 'conforme'
                WHEN ? = 'refuse' THEN 'non-conforme'
                ELSE statut_paiement
              END
        WHERE id_demande = ?`,
      [statut, statut, statut, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Demande introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createDraft,
  preview,
  listMine,
  submitPayment,
  getDocument,
  listBackoffice,
  listBackofficeClauses,
  createBackofficeClause,
  updateBackofficeClause,
  updateBackoffice,
  getBackofficePaymentProof,
  validateData,
  documentHtml,
  getImageFormat,
};
