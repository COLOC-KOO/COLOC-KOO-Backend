const depotAnnonceModel = require('../Models/depotAnnonce.model');
const annoncesController = require('./annonces.controller');

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
      return 'Chaque chambre doit avoir un loyer, une date de disponibilitÃ© et le champ meublÃ©e.';
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
