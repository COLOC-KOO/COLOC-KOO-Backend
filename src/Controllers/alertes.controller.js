// src/Controllers/alertes.controller.js
const { query } = require('../Services/db.service.js');

// GET /api/alertes/:idUtilisateur
async function getAlertes(req, res) {
  try {
    const rows = await query(
      `SELECT r.*, v.nom_ville
         FROM recherches_sauvegardees r
         LEFT JOIN villes v ON v.id_ville = r.id_ville
        WHERE r.id_utilisateur = ?
        ORDER BY r.date_creation DESC`,
      [req.params.idUtilisateur]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erreur getAlertes:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// POST /api/alertes
async function createAlerte(req, res) {
  try {
    const b = req.body;
    const result = await query(
      `INSERT INTO recherches_sauvegardees
        (id_utilisateur, id_ville, quartier, prix_max, type_propriete,
         type_annonce, regles, commodites, rayon_km, notif_push, notif_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id_utilisateur,
        b.id_ville || null,
        b.quartier || null,
        b.prix_max || null,
        b.types_bien && b.types_bien.length ? b.types_bien.join(',') : null,
        b.types_annonce && b.types_annonce.length ? b.types_annonce.join(',') : null,
        b.regles && b.regles.length ? JSON.stringify(b.regles) : null,
        b.commodites ? JSON.stringify(b.commodites) : null,
        b.rayon_km || null,
        b.notif_push ? 1 : 0,
        b.notif_email ? 1 : 0,
      ]
    );
    res.status(201).json({ ok: true, id: result.insertId || (result[0] && result[0].insertId) });
  } catch (err) {
    console.error('Erreur createAlerte:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// DELETE /api/alertes/:id
async function deleteAlerte(req, res) {
  try {
    await query(`DELETE FROM recherches_sauvegardees WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur deleteAlerte:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getAlertes, createAlerte, deleteAlerte };
