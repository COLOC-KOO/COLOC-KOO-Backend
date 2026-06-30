const { query, insertAndGetId } = require('../Services/db.service');

async function list(req, res, next) {
  try {
    const rows = await query('SELECT * FROM partenaires ORDER BY niveau DESC, nom ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createRequest(req, res, next) {
  try {
    const { nom_entreprise, email, secteur, niveau_souhaite, message } = req.body;
    if (!nom_entreprise || !email) {
      return res.status(400).json({ message: 'Nom de l entreprise et email requis.' });
    }
    const id = await insertAndGetId(
      `INSERT INTO demandes_partenaires (nom_entreprise, email, secteur, niveau_souhaite, message) VALUES (?, ?, ?, ?, ?)`,
      [nom_entreprise, email, secteur || null, niveau_souhaite || null, message || null]
    );
    res.status(201).json({ id_demande: id });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, createRequest };
