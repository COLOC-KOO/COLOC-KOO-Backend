const { query } = require('../Services/db.service');
const { mapAnnonceRow, mapUserRow } = require('../Services/mappers');

async function dashboard(req, res, next) {
  try {
    const [queue, validated, members, month, rate] = await Promise.all([
      query("SELECT COUNT(*) AS n FROM annonces WHERE statut = 'pending'"),
      query("SELECT COUNT(*) AS n FROM annonces WHERE statut = 'active' AND DATE(date_publication) = CURDATE()"),
      query("SELECT COUNT(*) AS n FROM utilisateurs WHERE statut = 'active'"),
      query("SELECT COUNT(*) AS n FROM annonces WHERE MONTH(date_creation) = MONTH(CURDATE()) AND YEAR(date_creation) = YEAR(CURDATE())"),
      query("SELECT ROUND(100 * SUM(CASE WHEN statut = 'active' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS n FROM annonces"),
    ]);

    res.json({
      annoncesFile: Number(queue[0]?.n || 0),
      validationsAujourdhui: Number(validated[0]?.n || 0),
      signalements: 0,
      membresActifs: Number(members[0]?.n || 0),
      annoncesMois: Number(month[0]?.n || 0),
      tauxValidation: Number(rate[0]?.n || 0),
      objectifJour: 30,
      progressObjectif: Math.min(100, Math.round((Number(validated[0]?.n || 0) / 30) * 100)),
    });
  } catch (err) {
    next(err);
  }
}

async function queue(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
             v.nom_ville, r.nom_region, ch.prix_loyer,
             GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
             GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
             GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
      FROM annonces a
      JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
      JOIN villes v ON v.id_ville = a.id_ville
      JOIN regions r ON r.id_region = v.id_region
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
      WHERE a.statut = 'pending'
      GROUP BY a.id_annonce
      ORDER BY a.date_creation DESC
      LIMIT 200
      `
    );
    res.json(rows.map(mapAnnonceRow));
  } catch (err) {
    next(err);
  }
}

async function members(req, res, next) {
  try {
    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       ORDER BY u.date_inscription DESC
       LIMIT 500`
    );
    res.json(rows.map(mapUserRow));
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT DATE_FORMAT(date_creation, '%Y-%m') AS month,
             COUNT(*) AS annonces
      FROM annonces
      GROUP BY DATE_FORMAT(date_creation, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function moderateAnnonce(req, res, next) {
  try {
    const { statut } = req.body;
    const allowedStatuses = ['pending', 'active', 'rejected', 'archived', 'expired', 'en_attente', 'refusee', 'terminee'];
    if (!allowedStatuses.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    const publicationSql = statut === 'active' ? ', date_publication = COALESCE(date_publication, NOW())' : '';
    await query(
      `UPDATE annonces SET statut = ?, date_modification = NOW()${publicationSql} WHERE id_annonce = ?`,
      [statut, req.params.id]
    );
    res.json({ message: 'Annonce mise a jour.' });
  } catch (err) {
    next(err);
  }
}

async function moderateMember(req, res, next) {
  try {
    const { statut } = req.body;
    await query('UPDATE utilisateurs SET statut = ? WHERE id_utilisateur = ?', [statut, req.params.id]);
    res.json({ message: 'Membre mis a jour.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, queue, members, stats, moderateAnnonce, moderateMember };
