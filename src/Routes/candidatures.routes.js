const router = require('express').Router();
const controller = require('../Controllers/candidatures.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.get('/', requireAuth, controller.listMine);
router.post('/', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.updateMine);
router.get('/admin/all', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.listAll);
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.updateStatus);

module.exports = router;
