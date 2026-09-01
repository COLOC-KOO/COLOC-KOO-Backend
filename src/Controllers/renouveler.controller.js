const { query } = require('../Services/db.service');
const { matchAlertesPourAnnonce } = require('../Services/Alertes.matching.service');

// Statuts depuis lesquels une annonce peut être renouvelée
const STATUTS_RENOUVELABLES = ['expired', 'archived'];

// Renouvelle une annonce expirée (ou archivée) : la repasse 'active',
// repart sur une date_publication = NOW() (et non un COALESCE, contrairement
// à updateStatus) pour lui redonner une durée de vie complète, et recalcule
// date_expiration en conséquence.
async function renouvelerAnnonce(req, res, next) {
  try {
    const idAnnonce = req.params.id;

    const rows = await query(
      'SELECT id_annonce, id_utilisateur, statut, type_bailleur, titre FROM annonces WHERE id_annonce = ? LIMIT 1',
      [idAnnonce]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    const annonce = rows[0];

    // Seul le propriétaire de l'annonce (ou un membre du staff) peut la renouveler.
    // D'après l'interface AuthUser (api.ts), le champ de rôle est `poste`, avec les
    // valeurs françaises 'superadmin' | 'admin' | 'moderateur' | ... (pas `role`,
    // pas 'super_admin'/'moderator' comme utilisé par erreur ailleurs dans les routes).
    const rolesStaff = ['admin', 'superadmin', 'moderateur'];
    const roleUtilisateur = req.user && (req.user.poste || req.user.role);
    const estProprietaire = req.user && Number(req.user.id) === Number(annonce.id_utilisateur);
    const estStaff = roleUtilisateur && rolesStaff.includes(roleUtilisateur);
    if (!estProprietaire && !estStaff) {
      return res.status(403).json({ message: "Vous n'êtes pas autorisé à renouveler cette annonce." });
    }

    if (!STATUTS_RENOUVELABLES.includes(annonce.statut)) {
      return res.status(400).json({
        message: `Cette annonce ne peut pas être renouvelée depuis son statut actuel (${annonce.statut}).`,
      });
    }

    await query(
      `UPDATE annonces
       SET statut = 'active',
           date_publication = NOW(),
           date_expiration = DATE_ADD(NOW(), INTERVAL CASE WHEN type_bailleur = 'membre' THEN 2 ELSE 4 END MONTH),
           date_modification = NOW()
       WHERE id_annonce = ?`,
      [idAnnonce]
    );

    // Relance le matching des alertes maintenant que l'annonce est de nouveau active
    // (best-effort : un échec ici ne doit pas faire échouer le renouvellement)
    try {
      await matchAlertesPourAnnonce(idAnnonce);
    } catch (matchErr) {
      console.error('[renouveler] erreur matchAlertesPourAnnonce pour annonce', idAnnonce, ':', matchErr.message);
    }

    const [updated] = await query(
      'SELECT id_annonce, reference, titre, statut, date_publication, date_expiration FROM annonces WHERE id_annonce = ? LIMIT 1',
      [idAnnonce]
    );

    res.json({
      message: 'Annonce renouvelée avec succès.',
      statut: updated.statut,
      date_expiration: updated.date_expiration,
      annonce: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { renouvelerAnnonce };