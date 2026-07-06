const { query } = require('../Services/db.service');

async function listMine(req, res, next) {
  try {
    const rows = await query('SELECT * FROM notifications WHERE id_utilisateur = ? ORDER BY date_creation DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await query('UPDATE notifications SET est_lue = 1 WHERE id_utilisateur = ?', [req.user.id]);
    res.json({ message: 'Notifications marquees comme lues.' });
  } catch (err) {
    next(err);
  }
}

async function markOneRead(req, res, next) {
  try {
    await query('UPDATE notifications SET est_lue = 1 WHERE id_notification = ? AND id_utilisateur = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marquee comme lue.' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await query('DELETE FROM notifications WHERE id_notification = ? AND id_utilisateur = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification supprimee.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMine, markAllRead, markOneRead, remove };
