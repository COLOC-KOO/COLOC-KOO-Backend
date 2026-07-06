const { query } = require('../Services/db.service');
const { mapUserRow } = require('../Services/mappers');

async function me(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur = ?
       LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] ? mapUserRow(rows[0]) : null);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const allowed = ['nom', 'prenom', 'telephone', 'bio', 'age', 'profession', 'profile_picture', 'ville_actuelle', 'ville_origine', 'langue_preferee', 'navigation_light'];
    const sets = [];
    const values = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }
    values.push(req.user.id);
    await query(`UPDATE utilisateurs SET ${sets.join(', ')} WHERE id_utilisateur = ?`, values);
    const updated = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur = ?
       LIMIT 1`,
      [req.user.id]
    );
    res.json(updated[0] ? mapUserRow(updated[0]) : null);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur = ?
       LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }
    res.json(mapUserRow(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function getSuperadmin(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE r.nom_role = 'super_admin' AND u.statut = 'active'
       ORDER BY u.date_inscription ASC
       LIMIT 1`
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Superadmin introuvable.' });
    }
    res.json(mapUserRow(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { role, q } = req.query;
    const clauses = [];
    const values = [];
    if (role && role !== 'all') {
      clauses.push('r.nom_role = ?');
      values.push(role);
    }
    if (q) {
      clauses.push('(u.nom LIKE ? OR u.prenom LIKE ? OR u.email LIKE ?)');
      values.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const sql = `
      SELECT u.*, r.nom_role
      FROM utilisateurs u
      JOIN roles r ON r.id_role = u.id_role
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY u.date_inscription DESC
      LIMIT 500
    `;
    const rows = await query(sql, values);
    res.json(rows.map(mapUserRow));
  } catch (err) {
    next(err);
  }
}


module.exports = { me, updateMe, getById, list, getSuperadmin };

