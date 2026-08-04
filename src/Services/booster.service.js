const { query } = require('./db.service');

const VALID_UNITS = new Set(['heure', 'jour', 'semaine', 'mois']);
const BOOSTER_START_SQL = 'COALESCE(da_boost.date_creation, a.date_publication, a.date_creation)';
const BOOSTER_END_SQL = `
  CASE b.unite
    WHEN 'heure' THEN DATE_ADD(${BOOSTER_START_SQL}, INTERVAL COALESCE(b.duree, 0) HOUR)
    WHEN 'semaine' THEN DATE_ADD(${BOOSTER_START_SQL}, INTERVAL COALESCE(b.duree, 0) WEEK)
    WHEN 'mois' THEN DATE_ADD(${BOOSTER_START_SQL}, INTERVAL COALESCE(b.duree, 0) MONTH)
    ELSE DATE_ADD(${BOOSTER_START_SQL}, INTERVAL COALESCE(b.duree, 0) DAY)
  END
`;
const BOOSTER_ACTIVE_SQL = `
  CASE
    WHEN a.booster IS NOT NULL
      AND a.booster <> 0
      AND b.id_booster IS NOT NULL
      AND b.est_actif = 1
      AND ${BOOSTER_END_SQL} >= NOW()
    THEN 1
    ELSE 0
  END
`;
const BOOSTER_SELECT_SQL = `
  b.id_booster AS boost_service_id,
  b.nom AS booster_nom,
  b.description AS booster_description,
  b.cle_service AS booster_cle_service,
  b.duree AS booster_duree,
  b.unite AS booster_unite,
  b.prix AS booster_prix,
  CASE WHEN b.id_booster IS NULL THEN NULL ELSE ${BOOSTER_START_SQL} END AS booster_date_creation,
  ${BOOSTER_ACTIVE_SQL} AS booster_actif
`;
const BOOSTER_JOIN_SQL = `
  LEFT JOIN depot_annonce da_boost ON da_boost.id_annonce = a.id_annonce
  LEFT JOIN booster b ON b.id_booster = a.booster
`;

let ensured = false;

async function ensureBoosterSchema() {
  if (ensured) return;

  await query(`
    CREATE TABLE IF NOT EXISTS booster (
      id_booster INT NOT NULL AUTO_INCREMENT,
      nom VARCHAR(150) NOT NULL,
      description TEXT NULL,
      cle_service VARCHAR(100) NOT NULL,
      duree INT UNSIGNED NOT NULL DEFAULT 1,
      prix DECIMAL(10,2) NOT NULL DEFAULT 0,
      unite ENUM('heure', 'jour', 'semaine', 'mois') NOT NULL DEFAULT 'jour',
      est_actif TINYINT(1) NOT NULL DEFAULT 1,
      date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_booster),
      UNIQUE KEY uq_booster_cle_service (cle_service),
      KEY idx_booster_actif (est_actif),
      KEY idx_booster_cle_service (cle_service)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query('ALTER TABLE annonces MODIFY COLUMN booster INT NULL').catch(() => {});
  await query('ALTER TABLE depot_annonce MODIFY COLUMN boost_service_id INT NULL').catch(() => {});
  ensured = true;
}

function normalizeBoosterPayload(body = {}, fallbackPrefix = 'boost_') {
  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
  const cle_service = typeof body.cle_service === 'string' && body.cle_service.trim()
    ? body.cle_service.trim()
    : `${fallbackPrefix}${Date.now()}`;
  const duree = Math.max(1, Number.parseInt(body.duree, 10) || 1);
  const prix = Number.isFinite(Number(body.prix)) ? Number(body.prix) : 0;
  const unite = VALID_UNITS.has(body.unite) ? body.unite : 'jour';
  const est_actif = body.est_actif === 0 || body.est_actif === false ? 0 : 1;

  return { nom, description, cle_service, duree, prix, unite, est_actif };
}

async function getActiveBoosterId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  await ensureBoosterSchema();
  const rows = await query('SELECT id_booster FROM booster WHERE id_booster = ? AND est_actif = 1 LIMIT 1', [id]);
  return rows.length ? rows[0].id_booster : null;
}

module.exports = {
  ensureBoosterSchema,
  normalizeBoosterPayload,
  getActiveBoosterId,
  BOOSTER_SELECT_SQL,
  BOOSTER_JOIN_SQL,
  BOOSTER_ACTIVE_SQL,
};