const { query } = require('../Services/db.service.js');

// GET /api/alertes/:idUtilisateur
async function getAlertes(req, res) {
  try {
    const rows = await query(
      `SELECT r.*, v.nom_ville
         FROM recherches_sauvegardees r
         INNER JOIN villes v ON v.id_ville = r.id_ville
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

    // id_ville est obligatoire : on n'accepte plus un nom de ville,
    // seulement l'id qui référence la table `villes`
    const idVille = Number(b.id_ville);
    if (!b.id_ville || Number.isNaN(idVille)) {
      return res.status(400).json({ error: 'id_ville est requis et doit être un identifiant valide' });
    }

    // Vérifie que la ville existe réellement avant l'insertion
    const villeRows = await query(
      `SELECT id_ville FROM villes WHERE id_ville = ?`,
      [idVille]
    );
    if (!villeRows.length) {
      return res.status(400).json({ error: 'Ville introuvable pour cet id_ville' });
    }

    const result = await query(
      `INSERT INTO recherches_sauvegardees
        (id_utilisateur, id_ville, quartier, prix_max, type_propriete,
         type_annonce, regles, commodites, rayon_km, notif_push, notif_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id_utilisateur,
        idVille,
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
    if (err.code === 'ER_NO_REFERENCED_ROW' || err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'id_ville invalide (clé étrangère)' });
    }
    console.error('Erreur createAlerte:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// PATCH /api/alertes/:id/notifications
// body: { notif_push?: boolean, notif_email?: boolean }
async function updateNotifications(req, res) {
  try {
    const { id } = req.params;
    const { notif_push, notif_email } = req.body;

    const champs = [];
    const valeurs = [];

    if (notif_push !== undefined) {
      champs.push('notif_push = ?');
      valeurs.push(notif_push ? 1 : 0);
    }
    if (notif_email !== undefined) {
      champs.push('notif_email = ?');
      valeurs.push(notif_email ? 1 : 0);
    }

    if (champs.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    valeurs.push(id);
    await query(
      `UPDATE recherches_sauvegardees SET ${champs.join(', ')} WHERE id = ?`,
      valeurs
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur updateNotifications:', err);
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

module.exports = { getAlertes, createAlerte, updateNotifications, deleteAlerte };