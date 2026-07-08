const { insertAndGetId, query } = require('../Services/db.service');

async function create(req, res, next) {
  try {
    const { nom, email, sujet, message } = req.body;
    if (!nom || !email || !sujet || !message) {
      return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
    }
    const id = await insertAndGetId(
      'INSERT INTO messages_contact (nom, email, sujet, message) VALUES (?, ?, ?, ?)',
      [nom, email, sujet, message]
    );

    const recipients = await query(
      `SELECT u.id_utilisateur
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE r.nom_role IN ('admin', 'super_admin') AND u.statut = 'active'`
    );

    const notificationText = `Nom: ${nom}\nEmail: ${email}\nMessage: ${message}`;
    for (const recipient of recipients) {
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'message', ?, ?, ?)` ,
        [recipient.id_utilisateur, `Nouveau message de contact: ${sujet}`, notificationText, '/admin/messages']
      ).catch(() => {});
    }

    res.status(201).json({ id_message: id });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
