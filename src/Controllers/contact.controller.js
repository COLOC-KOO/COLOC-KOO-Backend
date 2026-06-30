const { insertAndGetId } = require('../Services/db.service');

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
    res.status(201).json({ id_message: id });
  } catch (err) {
    next(err);
  }
}

module.exports = { create };
