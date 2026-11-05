const { query } = require('./db.service');

const MAINTENANCE_CONFIG_KEY = 'SITE_MAINTENANCE_MODE';
let maintenanceConfigSchemaPromise;

function parseMaintenanceMode(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return null;
}

function environmentMaintenanceMode() {
  return parseMaintenanceMode(process.env.SITE_MAINTENANCE_MODE) ?? true;
}

async function ensureMaintenanceConfigSchema() {
  if (!maintenanceConfigSchemaPromise) {
    maintenanceConfigSchemaPromise = query(`
      CREATE TABLE IF NOT EXISTS configuration_backoffice (
        cle VARCHAR(120) NOT NULL,
        valeur JSON NULL,
        date_modification DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (cle)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      maintenanceConfigSchemaPromise = undefined;
      throw error;
    });
  }
  await maintenanceConfigSchemaPromise;
}

async function getMaintenanceMode() {
  await ensureMaintenanceConfigSchema();
  const rows = await query(
    'SELECT valeur FROM configuration_backoffice WHERE cle = ? LIMIT 1',
    [MAINTENANCE_CONFIG_KEY]
  );
  return rows.length
    ? parseMaintenanceMode(rows[0].valeur) ?? environmentMaintenanceMode()
    : environmentMaintenanceMode();
}

async function setMaintenanceMode(enabled) {
  if (typeof enabled !== 'boolean') {
    throw new TypeError('Le mode maintenance doit être un booléen.');
  }
  await ensureMaintenanceConfigSchema();
  await query(
    'INSERT INTO configuration_backoffice (cle, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), date_modification = NOW()',
    [MAINTENANCE_CONFIG_KEY, JSON.stringify(enabled)]
  );
  return enabled;
}

function isStaffRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(normalized);
}

module.exports = {
  getMaintenanceMode,
  setMaintenanceMode,
  isStaffRole,
  MAINTENANCE_CONFIG_KEY,
};
