const { query } = require('../Services/db.service');
const { ensureBoosterSchema } = require('../Services/booster.service');
const { getMaintenanceMode } = require('../Services/siteMaintenance.service');

// ============================================================================
//  CONTENU DU CONTRAT â€” 100% en base (bareme, paiement, clauses, textes)
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
let legacyClausesRepaired = false;
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
// Gabarit HTML du vrai document de contrat (100% en base). Les {placeholders} sont
// remplaces cote backend a partir des donnees reelles (parties, logement, adresse exacte...).
const DEFAULT_DOCUMENT_TEMPLATE = `<h1>Contrat de colocation — Sarintany'COLOC</h1>
<p class="ref">Référence : {reference} — Fait à {ville}, le {today}</p>

<h2>Entre les soussigné·e·s</h2>
<p>Le/La propriétaire (bailleur) : <b>{proprietaire}</b></p>
<p>Les colocataires (preneurs) : <b>{colocataires}</b></p>

<h2>Désignation du logement</h2>
<p>Adresse : <b>{adresse}</b>.</p>
<p>Nature du bien : {type_bien}.</p>
<p>Date d'entrée dans les lieux : <b>{date_entree}</b>.</p>

<h2>Conditions du bail</h2>
<p>Type de bail : <b>{type_bail}</b>.</p>
<p>{solidarite_phrase}</p>
<p>Loyer mensuel : <b>{loyer} Ar</b> — Charges : <b>{charges} Ar</b> — Dépôt de garantie : <b>{caution} Ar</b>.</p>

<h2>Article 1 — Objet</h2>
<p>Le présent contrat a pour objet de définir les règles de la vie commune et la répartition des charges entre les colocataires du logement désigné ci-dessus.</p>

<h2>Article 2 — Éléments du contrat</h2>
{clauses_list}

<h2>Article 3 — État des lieux</h2>
<p>Un état des lieux contradictoire est établi à l'entrée et à la sortie du logement et annexé au présent contrat.</p>

<h2>Signatures</h2>
{signatures}`;
const DEFAULT_EDL_TEMPLATE = `<h1>État des lieux — Sarintany'COLOC</h1>
<p class="ref">Référence : {reference} — Fait à {ville}, le {today}</p>

<h2>Logement</h2>
<p>Adresse : <b>{adresse}</b> ({type_bien}).</p>
<p>Occupants : <b>{colocataires}</b>.</p>
<p>Date d'entrée : <b>{date_entree}</b>.</p>

<h2>Constat</h2>
<p>Le présent document constate l'état du logement et de ses équipements à l'entrée et à la sortie des lieux (constat contradictoire entre le propriétaire et les colocataires).</p>

<h2>Signatures</h2>
{signatures}`;

const WINDOWS_1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function repairMojibake(text) {
  if (!/[ÃÂâð]/.test(text)) return text;
  const bytes = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const byte = WINDOWS_1252_BYTES.get(codePoint) ?? (codePoint <= 0xff ? codePoint : null);
    if (byte == null) return text;
    bytes.push(byte);
  }
  try {
    const decoded = utf8Decoder.decode(Uint8Array.from(bytes));
    return /[ÃÂâð]/.test(decoded) ? text : decoded;
  } catch {
    return text;
  }
}

function repairConfigValue(value) {
  if (typeof value === 'string') return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairConfigValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      repairConfigValue(item),
    ]));
  }
  return value;
}

async function getConfigValue(cle, fallback) {
  const rows = await query('SELECT valeur FROM configuration_backoffice WHERE cle = ? LIMIT 1', [cle]);
  if (!rows.length || rows[0].valeur == null) return fallback;
  let value = rows[0].valeur;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // Plain text configuration values, including HTML templates, are valid.
    }
  }
  const repaired = repairConfigValue(value);
  if (JSON.stringify(repaired) !== JSON.stringify(value)) {
    await query('UPDATE configuration_backoffice SET valeur = ? WHERE cle = ?', [
      JSON.stringify(repaired),
      cle,
    ]);
  }
  return repaired;
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

  if (!legacyClausesRepaired) {
    const legacyClauses = [
      ['IdentitÃ©s & logement', 'Identités & logement', "Colocataires, adresse du bien, date d'entrÃ©e (inclus).", "Colocataires, adresse du bien, date d'entrée (inclus)."],
      ['RÃ©partition du loyer et des charges', 'Répartition du loyer et des charges', 'Quote-part de chacun, modalitÃ©s de paiement.', 'Quote-part de chacun, modalités de paiement.'],
      ['DÃ©pÃ´t de garantie / caution solidaire', 'Dépôt de garantie / caution solidaire', 'Montant, conditions de restitution.', 'Montant, conditions de restitution.'],
      ["Ã‰tat des lieux d'entrÃ©e", "État des lieux d'entrée", 'Annexe descriptive des parties privatives et communes.', 'Annexe descriptive des parties privatives et communes.'],
      ['Clause de dÃ©part anticipÃ©', 'Clause de départ anticipé', 'PrÃ©avis, remplacement du colocataire sortant.', 'Préavis, remplacement du colocataire sortant.'],
    ];
    for (const [legacyTitle, title, legacyDescription, description] of legacyClauses) {
      await query(
        'UPDATE contrat_clauses SET titre = ?, description = IF(description = ?, ?, description) WHERE titre = ?',
        [title, legacyDescription, description, legacyTitle]
      );
    }
    legacyClausesRepaired = true;
  }

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
    CONTRACT_DOCUMENT_TEMPLATE: DEFAULT_DOCUMENT_TEMPLATE,
    CONTRACT_EDL_TEMPLATE: DEFAULT_EDL_TEMPLATE,
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
    const [clauseRows, tiers, edlPrix, mobileMoney, offer, body, bail, solidarite, mailNote, contratOffers, edlOffers] = await Promise.all([
      query('SELECT id_clause, titre, description FROM contrat_clauses WHERE est_actif = 1 ORDER BY ordre, id_clause'),
      getConfigValue('CONTRACT_TIERS', DEFAULT_CONTRACT_TIERS),
      getConfigValue('EDL_PRIX', DEFAULT_EDL_PRIX),
      getConfigValue('MOBILE_MONEY', DEFAULT_MOBILE_MONEY),
      getConfigValue('CONTRACT_OFFER', DEFAULT_OFFER),
      getConfigValue('CONTRACT_BODY', DEFAULT_BODY),
      getConfigValue('BAIL_OPTIONS', DEFAULT_BAIL),
      getConfigValue('SOLIDARITE_OPTIONS', DEFAULT_SOLIDARITE),
      getConfigValue('CONTRACT_MAIL_NOTE', DEFAULT_MAIL_NOTE),
      // Offres de contrat / EDL depuis services_ckoo (choisies par le deposant).
      query("SELECT id_service, cle_service, nom, description, prix FROM services_ckoo WHERE cle_service LIKE 'contrat%' AND est_actif = 1 ORDER BY nom"),
      query("SELECT id_service, cle_service, nom, description, prix FROM services_ckoo WHERE cle_service LIKE 'edl%' AND est_actif = 1 ORDER BY nom"),
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
      contratOffers: contratOffers.map((o) => ({ id: o.id_service, nom: o.nom, description: o.description, prix: Number(o.prix) || 0 })),
      edlOffers: edlOffers.map((o) => ({ id: o.id_service, nom: o.nom, description: o.description, prix: Number(o.prix) || 0 })),
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

async function listBoosters(req, res, next) {
  try {
    await ensureBoosterSchema();
    const rows = await query(
      `SELECT id_booster, nom, description, cle_service, duree, prix, unite, est_actif, date_creation
       FROM booster
       WHERE est_actif = 1
       ORDER BY cle_service ASC, duree ASC, prix ASC, nom ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
async function siteStatus(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ maintenanceMode: await getMaintenanceMode() });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRoles, listLangues, listRegions, listVilles, listServices, listBoosters, contractConfig, ensureContractContent, getConfigValue, siteStatus };
