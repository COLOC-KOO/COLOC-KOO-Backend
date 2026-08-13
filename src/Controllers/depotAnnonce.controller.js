const depotAnnonceModel = require('../Models/depotAnnonce.model');
const annoncesController = require('./annonces.controller');
const { query } = require('../Services/db.service');
const notify = require('../Services/notify.service');

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateCreatePayload(payload) {
  const required = ['adresse', 'type_annonce', 'logement', 'nombre_pieces', 'email'];
  for (const field of required) {
    if (!payload[field]) return `${field} est requis.`;
  }
  if (!isEmail(payload.email)) return 'E-mail invalide.';
  if (!Array.isArray(payload.chambres) || payload.chambres.length === 0) return 'Au moins une chambre est requise.';

  for (const room of payload.chambres) {
    if (!room.loyer || !room.disponible_a_partir || !room.meublee) {
      return 'Chaque chambre doit avoir un loyer, une date de disponibilite et le champ meublee.';
    }
  }
  return null;
}

async function uploadPhotos(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'Aucune photo envoyee.' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const photos = files.map((file) => `${baseUrl}/uploads/depot-annonce/${file.filename}`);
    res.status(201).json({ photos });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const validationError = validateCreatePayload(req.body || {});
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const created = await depotAnnonceModel.createDepotAnnonce(req.user.id, req.body);

    // Notifie le staff de moderation (moderateurs + admins + super-admins) :
    // in-app + email, geres tous les deux par notify.notifyStaff.
    // Best-effort : n'echoue jamais le depot de l'annonce.
    try {
      const [dep] = await query(
        'SELECT prenom, nom, email FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1',
        [req.user.id]
      );
      const nomDeposant = dep ? `${dep.prenom || ''} ${dep.nom || ''}`.trim() : `#${req.user.id}`;
      const emailCompte = dep ? dep.email : null; // email du compte connecte (auteur du depot)

      const {
        adresse,
        type_annonce,
        logement,
        nombre_pieces,
        description,
        email, // email de contact saisi dans le formulaire de depot
        chambres = [],
      } = req.body;

      const annonceId = created.id_annonce || created.id;

      // Resume des chambres saisies (loyer + disponibilite + meublee), pour
      // que le staff voie d'un coup d'oeil ce qui a ete rempli.
      const resumeChambres = Array.isArray(chambres) && chambres.length
        ? chambres
            .map((c, i) => `Chambre ${i + 1} : ${c.loyer ? `${c.loyer} Ar` : '?'} · dispo. ${c.disponible_a_partir || '?'} · ${c.meublee ? 'meublee' : 'non meublee'}`)
            .join('<br>')
        : null;

      await notify.notifyStaff({
        titre: 'Nouvelle annonce a valider',
        texte: `${nomDeposant} a depose une annonce (${adresse}). En attente de validation.`,
        lien: '/admin/annonces',
        roles: ['moderator', 'admin', 'super_admin'],
        intro: `<strong>${nomDeposant}</strong> a depose une nouvelle annonce, en attente de validation.`,
        details: [
          ['Depose par', nomDeposant],
          ['Email du compte', emailCompte],
          ['Email de contact fourni', email],
          ['Adresse', adresse],
          ['Type d\'annonce', type_annonce],
          ['Logement', logement],
          ['Nombre de pieces', nombre_pieces],
          ['Chambres', resumeChambres],
        ],
        action: { label: "Ouvrir la file de validation", path: `/admin/annonces/${annonceId || ''}` },
      });
    } catch (error) {
      console.warn('[depotAnnonce] Notification staff non envoyee:', error.message);
    }

    res.status(201).json({
      ...created,
      message: 'Annonce deposee avec succes.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list: annoncesController.list,
  getById: annoncesController.getById,
  uploadPhotos,
  create,
};