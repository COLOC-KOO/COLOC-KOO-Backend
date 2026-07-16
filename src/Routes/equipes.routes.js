const router = require('express').Router();
const controller = require('../Controllers/equipes.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

// Equipes liees a une annonce.
router.get('/annonces/:annonceId', requireAuth, controller.listByAnnonce);

// Membres d'une equipe.
router.post('/:equipeId/membres', requireAuth, controller.addMembre);
router.delete('/:equipeId/membres/:userId', requireAuth, controller.removeMembre);

// CRUD equipe.
router.get('/:id', requireAuth, controller.getOne);
router.post('/', requireAuth, controller.create);
router.put('/:id', requireAuth, controller.update);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;
