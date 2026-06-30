const router = require('express').Router();
const controller = require('../Controllers/users.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, controller.updateMe);
router.get('/:id', requireAuth, controller.getById);
router.get('/', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.list);

module.exports = router;
