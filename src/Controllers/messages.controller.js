const { query, insertAndGetId } = require('../Services/db.service');

async function listThreads(req, res, next) {
  try {
    const rows = await query(
      `SELECT
         CASE WHEN id_expediteur = ? THEN id_destinataire ELSE id_expediteur END AS interlocuteur_id,
         MAX(date_envoi) AS dernier_message,
         COUNT(*) AS total_messages,
         SUM(CASE WHEN id_destinataire = ? AND est_lu = 0 THEN 1 ELSE 0 END) AS non_lus
       FROM messages
       WHERE id_expediteur = ? OR id_destinataire = ?
       GROUP BY interlocuteur_id
       ORDER BY dernier_message DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getThread(req, res, next) {
  try {
    const otherId = req.params.userId;
    const rows = await query(
      `SELECT m.*, ex.nom AS expediteur_nom, ex.prenom AS expediteur_prenom,
              de.nom AS destinataire_nom, de.prenom AS destinataire_prenom,
              a.titre AS annonce_titre
       FROM messages m
       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces a ON a.id_annonce = m.id_annonce
       WHERE (m.id_expediteur = ? AND m.id_destinataire = ?) OR (m.id_expediteur = ? AND m.id_destinataire = ?)
       ORDER BY m.date_envoi ASC`,
      [req.user.id, otherId, otherId, req.user.id]
    );
    await query('UPDATE messages SET est_lu = 1 WHERE id_expediteur = ? AND id_destinataire = ?', [otherId, req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function send(req, res, next) {
  try {
    const { id_destinataire, id_annonce, sujet, contenu, message_parent } = req.body;
    if (!id_destinataire || !contenu) {
      return res.status(400).json({ message: 'Destinataire et contenu requis.' });
    }
    const id = await insertAndGetId(
      `INSERT INTO messages (id_expediteur, id_destinataire, id_annonce, sujet, contenu, message_parent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, id_destinataire, id_annonce || null, sujet || null, contenu, message_parent || null]
    );
    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'message', ?, ?, ?)`,
      [id_destinataire, sujet || 'Nouveau message', contenu.slice(0, 255), `/messages/${req.user.id}`]
    ).catch(() => {});
    res.status(201).json({ id_message: id });
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const { raison, description } = req.body;
    const rows = await query('SELECT * FROM messages WHERE id_message = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Message introuvable.' });
    const message = rows[0];
    const target = message.id_expediteur === req.user.id ? message.id_destinataire : message.id_expediteur;
    const id = await insertAndGetId(
      `INSERT INTO signalements (id_utilisateur_signalant, id_utilisateur_cible, id_annonce, id_message, raison, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, target, message.id_annonce || null, message.id_message, raison || 'Signalement conversation', description || null]
    );
    await query('UPDATE messages SET signalement_abus = 1 WHERE id_message = ?', [req.params.id]);
    res.status(201).json({ id_signalement: id });
  } catch (err) {
    next(err);
  }
}

module.exports = { listThreads, getThread, send, report };
