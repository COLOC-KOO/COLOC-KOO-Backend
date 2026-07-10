const { query } = require('../Services/db.service');
const { mapAnnonceRow } = require('../Services/mappers');

async function list(req, res, next) {
  try {
    await query('SET SESSION group_concat_max_len = 1000000');
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
             v.nom_ville, r.nom_region,
             MIN(ch.surface) AS chambre_surface,
             MIN(ch.prix_loyer) AS prix_loyer,
             MIN(ch.date_disponibilite) AS date_disponibilite,
             MAX(f.date_ajout) AS favori_date_ajout,
             GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
             GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
             GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
      FROM favoris f
      JOIN annonces a ON a.id_annonce = f.id_annonce
      JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
      JOIN villes v ON v.id_ville = a.id_ville
      JOIN regions r ON r.id_region = v.id_region
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
      WHERE f.id_utilisateur = ?
      GROUP BY a.id_annonce
      ORDER BY favori_date_ajout DESC
      `,
      [req.user.id]
    );
    res.json(rows.map(mapAnnonceRow));
  } catch (err) {
    next(err);
  }
}

async function toggle(req, res, next) {
  try {
    const idAnnonce = req.params.idAnnonce;
    const existing = await query(
      'SELECT id_favori FROM favoris WHERE id_utilisateur = ? AND id_annonce = ? LIMIT 1',
      [req.user.id, idAnnonce]
    );
    if (existing.length) {
      return res.json({
        favori: true,
        alreadyExists: true,
        message: "c'est déjà dans votre favoris",
      });
    }
    await query('INSERT INTO favoris (id_utilisateur, id_annonce) VALUES (?, ?)', [req.user.id, idAnnonce]);
    res.status(201).json({
      favori: true,
      alreadyExists: false,
      message: 'Ajouté comme favoris avec succès',
    });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await query('DELETE FROM favoris WHERE id_utilisateur = ? AND id_annonce = ?', [req.user.id, req.params.idAnnonce]);
    res.json({ favori: false });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, toggle, remove };


