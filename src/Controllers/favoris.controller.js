const { query } = require('../Services/db.service');
const { mapAnnonceRow } = require('../Services/mappers');

async function list(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
             v.nom_ville, r.nom_region,
             ch.surface AS chambre_surface, ch.prix_loyer, ch.date_disponibilite,
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
      ORDER BY f.date_ajout DESC
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
      await query('DELETE FROM favoris WHERE id_utilisateur = ? AND id_annonce = ?', [req.user.id, idAnnonce]);
      return res.json({ favori: false });
    }
    await query('INSERT INTO favoris (id_utilisateur, id_annonce) VALUES (?, ?)', [req.user.id, idAnnonce]);
    res.status(201).json({ favori: true });
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
