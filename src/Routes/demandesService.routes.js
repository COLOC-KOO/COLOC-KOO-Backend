const router = require('express').Router();
const controller = require('../Controllers/demandesService.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

// Catalogue des « autres services » (service_%) — public.
router.get('/catalogue', controller.listCatalogue);

// Toutes les demandes (back-office) — staff uniquement.
router.get('/admin', requireAuth, requireRole('admin', 'super_admin'), controller.listForStaff);

// Changement de statut d'une demande (dont « masquer » = en-cours) — staff.
router.patch('/:reference/statut', requireAuth, requireRole('admin', 'super_admin'), controller.updateStatut);

// Demandes de l'utilisateur connecte.
router.get('/mine', requireAuth, controller.listMine);

// Soumission d'une demande — connexion requise.
router.post('/', requireAuth, controller.createDemande);

module.exports = router;
