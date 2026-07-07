const { query } = require('../Services/db.service');

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

module.exports = { listRoles, listLangues, listRegions, listVilles, listServices };
