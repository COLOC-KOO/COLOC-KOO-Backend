const router = require('express').Router();
const controller = require('../Controllers/candidatures.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.get('/', requireAuth, controller.listMine);
router.post('/', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.updateMine);
router.get('/admin/all', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.listAll);
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.updateStatus);

//NOUVELLES ROUTES
router.get('/candidatures/annonce/:id', controller.listByAnnonce);
router.get('/candidatures/verifier', controller.checkUserApplied);

module.exports = router;
