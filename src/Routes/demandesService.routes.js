const router = require('express').Router();
const controller = require('../Controllers/demandesService.controller');
const {requireAuth, requireRole} = require('../Middleware/auth.middleware');

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

// Marquer comme appelé
router.post('/:reference/appel', requireAuth, requireRole('admin', 'super_admin'), controller.marquerAppele);

// Marquer mail envoyé
router.post('/:reference/mail', requireAuth, requireRole('admin', 'super_admin'), controller.marquerMailEnvoye);

// Relancer
router.post('/:reference/relance', requireAuth, requireRole('admin', 'super_admin'), controller.relancerDemande);

// Programmer RDV
router.post('/:reference/rdv', requireAuth, requireRole('admin', 'super_admin'), controller.programmerRdv);

// Annuler RDV
router.post('/:reference/annuler-rdv', requireAuth, requireRole('admin', 'super_admin'), controller.annulerRdv);

// Mettre à jour la synthèse
router.post('/:reference/synthese', requireAuth, requireRole('admin', 'super_admin'), controller.updateSynthese);

// Valider une demande
router.post('/:reference/valider', requireAuth, requireRole('admin', 'super_admin'), controller.validerDemande);

// Annuler une demande
router.post('/:reference/annuler', requireAuth, requireRole('admin', 'super_admin'), controller.annulerDemande);

module.exports = router;
