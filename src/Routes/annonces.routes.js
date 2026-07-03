const router = require('express').Router();
const controller = require('../Controllers/annonces.controller');
const { requireAuth, requireRole, optionalAuth } = require('../Middleware/auth.middleware');

router.get('/', optionalAuth, controller.list);
router.get('/:id', controller.getById);
router.post('/', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.update);
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.updateStatus);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;
