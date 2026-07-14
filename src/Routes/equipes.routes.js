// Routes/equipes.routes.js
const router = require('express').Router();
const equipesController = require('../Controllers/equipes.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

// Vérifier que le contrôleur existe et a les bonnes méthodes
console.log('📦 Contrôleur equipes chargé:', Object.keys(equipesController));

// Vérifier que toutes les méthodes existent
const methods = ['listByAnnonce', 'getOne', 'create', 'update', 'remove', 'addMember', 'removeMember'];
methods.forEach(method => {
  if (typeof equipesController[method] !== 'function') {
    console.error(`❌ La méthode "${method}" n'est pas une fonction dans le contrôleur`);
    // Créer une méthode factice pour éviter l'erreur
    equipesController[method] = (req, res) => {
      res.status(501).json({ message: `Méthode "${method}" non implémentée` });
    };
  }
});

// Routes pour les équipes
// GET /api/equipes/annonces/:annonceId - Récupérer toutes les équipes d'une annonce
router.get('/annonces/:annonceId', requireAuth, equipesController.listByAnnonce);

// GET /api/equipes/:id - Récupérer une équipe par son ID
router.get('/:id', requireAuth, equipesController.getOne);

// POST /api/equipes - Créer une équipe
router.post('/', requireAuth, equipesController.create);

// PUT /api/equipes/:id - Mettre à jour une équipe
router.put('/:id', requireAuth, equipesController.update);

// DELETE /api/equipes/:id - Supprimer une équipe
router.delete('/:id', requireAuth, equipesController.remove);

// POST /api/equipes/:id/membres - Ajouter un membre à une équipe
router.post('/:id/membres', requireAuth, equipesController.addMember);

// DELETE /api/equipes/:id/membres/:userId - Retirer un membre d'une équipe
router.delete('/:id/membres/:userId', requireAuth, equipesController.removeMember);

module.exports = router;