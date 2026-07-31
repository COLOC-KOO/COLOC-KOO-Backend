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
    const allowed = ['nom', 'prenom', 'telephone', 'cin', 'bio', 'age', 'profession', 'profile_picture', 'ville_actuelle', 'ville_origine', 'langue_preferee', 'navigation_light'];
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

async function search(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.id_utilisateur <> ?
         AND u.statut = 'active'
         AND (? = '' OR u.nom LIKE ? OR u.prenom LIKE ? OR u.email LIKE ?)
       ORDER BY u.prenom ASC, u.nom ASC
       LIMIT 50`,
      [req.user.id, q, like, like, like]
    );
    res.json(rows.map(mapUserRow));
  } catch (err) {
    next(err);
  }
}

async function counters(req, res, next) {
  try {
    const [favoris, notifications, directMessages, groupMessages] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM favoris WHERE id_utilisateur = ?', [req.user.id]).catch(() => [{ n: 0 }]),
      query('SELECT COUNT(*) AS n FROM notifications WHERE id_utilisateur = ? AND est_lue = 0', [req.user.id]).catch(() => [{ n: 0 }]),
      query('SELECT COUNT(*) AS n FROM messages WHERE id_destinataire = ? AND est_lu = 0', [req.user.id]).catch(() => [{ n: 0 }]),
      query(
        `SELECT COUNT(*) AS n
         FROM groupe_messages gm
         JOIN groupe_membres mb ON mb.id_groupe = gm.id_groupe AND mb.id_utilisateur = ?
         LEFT JOIN groupe_lectures gl ON gl.id_groupe = gm.id_groupe AND gl.id_utilisateur = ?
         WHERE gm.id_expediteur <> ? AND (gl.dernier_message_lu IS NULL OR gm.id_message > gl.dernier_message_lu)`,
        [req.user.id, req.user.id, req.user.id]
      ).catch(() => [{ n: 0 }]),
    ]);

    res.json({
      favoris: Number(favoris[0]?.n || 0),
      notifications: Number(notifications[0]?.n || 0),
      messages: Number(directMessages[0]?.n || 0) + Number(groupMessages[0]?.n || 0),
    });
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


module.exports = { me, updateMe, getById, list, getSuperadmin, search, counters };

