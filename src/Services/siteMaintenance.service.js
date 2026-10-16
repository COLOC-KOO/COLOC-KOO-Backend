function isMaintenanceMode() {
  const value = process.env.SITE_MAINTENANCE_MODE;
  if (value === undefined) return true;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return true;
}

function isStaffRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(normalized);
}

module.exports = { isMaintenanceMode, isStaffRole };
