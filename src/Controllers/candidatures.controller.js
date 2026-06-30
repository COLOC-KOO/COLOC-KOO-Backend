const { query, insertAndGetId } = require('../Services/db.service');

async function listMine(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT c.*, a.titre, a.quartier, a.id_annonce, ch.prix_loyer,
             GROUP_CONCAT(DISTINCT CONCAT(me.id_utilisateur, '::', me.statut) ORDER BY me.id SEPARATOR '||') AS membres
      FROM candidatures c
      JOIN annonces a ON a.id_annonce = c.id_annonce
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN candidature_membres me ON me.id_candidature = c.id_candidature
      WHERE c.id_utilisateur = ?
      GROUP BY c.id_candidature
      ORDER BY c.date_creation DESC
      `,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT c.*, a.titre, a.quartier, a.id_annonce, ch.prix_loyer
      FROM candidatures c
      JOIN annonces a ON a.id_annonce = c.id_annonce
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      ORDER BY c.date_creation DESC
      LIMIT 500
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { id_annonce, message, statut = 'en_attente', membres = [] } = req.body;
    if (!id_annonce) {
      return res.status(400).json({ message: 'Annonce requise.' });
    }

    const id = await insertAndGetId(
      `INSERT INTO candidatures (id_utilisateur, id_annonce, message, statut) VALUES (?, ?, ?, ?)`,
      [req.user.id, id_annonce, message || null, statut]
    );

    for (const membre of membres) {
      await query(
        'INSERT INTO candidature_membres (id_candidature, nom, initiales, statut, profession, age) VALUES (?, ?, ?, ?, ?, ?)',
        [id, membre.nom, membre.initiales, membre.statut || 'en_attente', membre.profession || null, membre.age || null]
      );
    }

    const created = await query('SELECT * FROM candidatures WHERE id_candidature = ? LIMIT 1', [id]);
    res.status(201).json(created[0]);
  } catch (err) {
    next(err);
  }
}

async function updateMine(req, res, next) {
  try {
    const { message, statut } = req.body;
    const sets = [];
    const values = [];
    if (message !== undefined) {
      sets.push('message = ?');
      values.push(message);
    }
    if (statut !== undefined) {
      sets.push('statut = ?');
      values.push(statut);
    }
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }
    values.push(req.params.id, req.user.id);
    await query(`UPDATE candidatures SET ${sets.join(', ')} WHERE id_candidature = ? AND id_utilisateur = ?`, values);
    res.json({ message: 'Candidature mise a jour.' });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { statut } = req.body;
    await query('UPDATE candidatures SET statut = ? WHERE id_candidature = ?', [statut, req.params.id]);
    res.json({ message: 'Statut mis a jour.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMine, listAll, create, updateMine, updateStatus };
