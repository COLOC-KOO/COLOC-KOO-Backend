const { query } = require('../Services/db.service');

// ============================================================================
//  CONTENU DU CONTRAT — 100% en base (bareme, paiement, clauses, textes)
//  Valeurs par defaut = seed initial ; une fois en base, la source de verite
//  est la DB (table contrat_clauses + cles configuration_backoffice).
// ============================================================================
const DEFAULT_CONTRACT_TIERS = [
  { maxLoyer: 450000, prix: 27000 },
  { maxLoyer: 1350000, prix: 47000 },
  { maxLoyer: null, prix: 60000 },
];
const DEFAULT_EDL_PRIX = 10000;
const DEFAULT_MOBILE_MONEY = [
  { nom: 'Orange Money', numero: '0320000000', couleur: '#ff7900', hint: "Scanne ce QR code avec l'appli Orange Money, ou compose le numero." },
  { nom: 'MVOLA', numero: '0340000000', couleur: '#e2001a', hint: "Scanne ce QR code avec l'appli MVOLA, ou compose le numero." },
];
const DEFAULT_CLAUSES = [
  { titre: 'Identités & logement', description: "Colocataires, adresse du bien, date d'entrée (inclus).", ordre: 1 },
  { titre: 'Répartition du loyer et des charges', description: 'Quote-part de chacun, modalités de paiement.', ordre: 2 },
  { titre: 'Dépôt de garantie / caution solidaire', description: 'Montant, conditions de restitution.', ordre: 3 },
  { titre: "État des lieux d'entrée", description: 'Annexe descriptive des parties privatives et communes.', ordre: 4 },
  { titre: 'Clause de départ anticipé', description: 'Préavis, remplacement du colocataire sortant.', ordre: 5 },
];
const DEFAULT_OFFER = {
  titre: 'Aide à la création de contrats avec les colocataires',
  texte: "Coloc'KOO peut rédiger pour toi un contrat de colocation conforme, signé entre les colocataires et/ou te proposer un document d'état des lieux. Voici un aperçu pré-rempli avec leurs noms et l'adresse du bien :",
};
const DEFAULT_BODY = {
  titre: "Contrat de colocation — Sarintany'COLOC",
  intro: "Entre les soussigné·e·s : {names}, ci-après dénommé·e·s « les colocataires »,\nPour le logement situé : {address},\nDate d'entrée dans les lieux : {date}.",
  corps: "Il a été convenu et arrêté ce qui suit. Article 1 — Objet : le présent contrat a pour objet de définir les règles de la vie commune et la répartition…",
};
const DEFAULT_BAIL = [
  { cle: 'individuel', titre: 'Bail individuel', description: 'Chaque colocataire signe son propre contrat avec le propriétaire.' },
  { cle: 'collectif', titre: 'Bail collectif', description: "Un seul document signé par l'ensemble des parties." },
];
const DEFAULT_SOLIDARITE = [
  { cle: 'avec', titre: 'AVEC clause de solidarité', description: "Tous les colocataires sont solidaires : si l'un manque, les autres sont redevables de l'ensemble du loyer." },
  { cle: 'sans', titre: 'SANS clause de solidarité', description: 'Chaque colocataire reste responsable de sa part seulement.' },
];
const DEFAULT_MAIL_NOTE = {
  contrat: "Le contrat finalisé te sera envoyé par e-mail à {email}. Tu n'auras plus qu'à le faire signer par l'ensemble des parties lors de la remise des clés. Pour compléter les informations nécessaires à la rédaction du contrat, rendez-vous dans ta messagerie.",
  edl: "Le document te sera envoyé par e-mail à {email}. Tu n'auras plus qu'à le faire signer par l'ensemble des parties lors de la remise des clés.",
};

async function getConfigValue(cle, fallback) {
  try {
    const rows = await query('SELECT valeur FROM configuration_backoffice WHERE cle = ? LIMIT 1', [cle]);
    if (!rows.length || rows[0].valeur == null) return fallback;
    const raw = rows[0].valeur;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

// Cree la table des clauses + seed initial des clauses et des textes/bareme en config.
// Idempotent : ne remplace jamais des valeurs deja saisies (INSERT IGNORE).
async function ensureContractContent() {
  await query(`
    CREATE TABLE IF NOT EXISTS contrat_clauses (
      id_clause INT NOT NULL AUTO_INCREMENT,
      titre VARCHAR(255) NOT NULL,
      description TEXT NULL,
      ordre INT NOT NULL DEFAULT 0,
      est_actif TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_clause)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS configuration_backoffice (
      cle VARCHAR(120) NOT NULL,
      valeur JSON NULL,
      date_modification DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (cle)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const countRows = await query('SELECT COUNT(*) AS n FROM contrat_clauses');
  if (Number(countRows[0]?.n || 0) === 0) {
    for (const clause of DEFAULT_CLAUSES) {
      await query(
        'INSERT INTO contrat_clauses (titre, description, ordre, est_actif) VALUES (?, ?, ?, 1)',
        [clause.titre, clause.description, clause.ordre]
      );
    }
  }

  const seeds = {
    CONTRACT_TIERS: DEFAULT_CONTRACT_TIERS,
    EDL_PRIX: DEFAULT_EDL_PRIX,
    MOBILE_MONEY: DEFAULT_MOBILE_MONEY,
    CONTRACT_OFFER: DEFAULT_OFFER,
    CONTRACT_BODY: DEFAULT_BODY,
    BAIL_OPTIONS: DEFAULT_BAIL,
    SOLIDARITE_OPTIONS: DEFAULT_SOLIDARITE,
    CONTRACT_MAIL_NOTE: DEFAULT_MAIL_NOTE,
  };
  for (const [cle, valeur] of Object.entries(seeds)) {
    await query(
      'INSERT IGNORE INTO configuration_backoffice (cle, valeur) VALUES (?, ?)',
      [cle, JSON.stringify(valeur)]
    );
  }
}

// Contenu complet du contrat, 100% depuis la base.
async function contractConfig(req, res, next) {
  try {
    await ensureContractContent();
    const [clauseRows, tiers, edlPrix, mobileMoney, offer, body, bail, solidarite, mailNote] = await Promise.all([
      query('SELECT titre, description FROM contrat_clauses WHERE est_actif = 1 ORDER BY ordre, id_clause'),
      getConfigValue('CONTRACT_TIERS', DEFAULT_CONTRACT_TIERS),
      getConfigValue('EDL_PRIX', DEFAULT_EDL_PRIX),
      getConfigValue('MOBILE_MONEY', DEFAULT_MOBILE_MONEY),
      getConfigValue('CONTRACT_OFFER', DEFAULT_OFFER),
      getConfigValue('CONTRACT_BODY', DEFAULT_BODY),
      getConfigValue('BAIL_OPTIONS', DEFAULT_BAIL),
      getConfigValue('SOLIDARITE_OPTIONS', DEFAULT_SOLIDARITE),
      getConfigValue('CONTRACT_MAIL_NOTE', DEFAULT_MAIL_NOTE),
    ]);
    res.json({
      tiers: Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_CONTRACT_TIERS,
      edlPrix: Number(edlPrix) || DEFAULT_EDL_PRIX,
      mobileMoney: Array.isArray(mobileMoney) && mobileMoney.length ? mobileMoney : DEFAULT_MOBILE_MONEY,
      clauses: clauseRows.length ? clauseRows : DEFAULT_CLAUSES.map(({ titre, description }) => ({ titre, description })),
      offer,
      body,
      bail: Array.isArray(bail) && bail.length ? bail : DEFAULT_BAIL,
      solidarite: Array.isArray(solidarite) && solidarite.length ? solidarite : DEFAULT_SOLIDARITE,
      mailNote,
    });
  } catch (err) {
    next(err);
  }
}

async function listRoles(req, res, next) {
  try {
    const rows = await query('SELECT id_role, nom_role, description FROM roles ORDER BY id_role');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listLangues(req, res, next) {
  try {
    const rows = await query('SELECT id_langue, code_langue, nom_langue FROM langues ORDER BY id_langue');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listRegions(req, res, next) {
  try {
    const rows = await query('SELECT id_region, nom_region FROM regions ORDER BY nom_region');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listVilles(req, res, next) {
  try {
    const rows = await query(
      `SELECT v.id_ville, v.nom_ville, v.id_region, r.nom_region
       FROM villes v
       JOIN regions r ON r.id_region = v.id_region
       ORDER BY r.nom_region, v.nom_ville`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listServices(req, res, next) {
  try {
    const rows = await query(
      `SELECT id_service, cle_service, nom, description, prix, unite, est_actif
       FROM services_ckoo
       WHERE est_actif = 1
       ORDER BY nom ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listRoles, listLangues, listRegions, listVilles, listServices, contractConfig };
