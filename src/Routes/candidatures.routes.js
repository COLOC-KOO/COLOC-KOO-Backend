const router = require('express').Router();
const controller = require('../Controllers/candidatures.controller');
const { requireAuth, requireRole, optionalAuth } = require('../Middleware/auth.middleware');

router.get('/', requireAuth, controller.listMine);
router.post('/', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.updateMine);
router.delete('/:id', requireAuth, controller.remove);
router.post('/:id/decision', requireAuth, controller.decide);
router.post('/annonce/:id/launch', requireAuth, controller.launchColocation);
router.post('/annonce/:id/contrats', requireAuth, controller.createContracts);
router.post('/contrats/:id/paiement', requireAuth, controller.submitContractPayment);
router.get('/contrats/:id/document', requireAuth, controller.generateContractDocument);
router.get('/annonce/:id/mes-contrats', requireAuth, controller.myContractsForAnnonce);
router.post('/annonce/:id/lancer-officiel', requireAuth, controller.lancerColocationOfficielle);
router.get('/admin/all', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.listAll);
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.updateStatus);

// ✅ NOUVELLES ROUTES - CORRIGÉES (sans /candidatures en double)
// Routes publiques ou avec authentification OPTIONNELLE
router.get('/annonce/:id', controller.listByAnnonce); // ✅ Public
// router.get('/verifier', optionalAuth, controller.checkUserApplied); // ✅ Optionnel
router.get('/verifier', controller.checkUserApplied);

module.exports = router;
