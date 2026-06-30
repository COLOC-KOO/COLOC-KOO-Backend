const router = require('express').Router();
const controller = require('../Controllers/notifications.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.get('/', requireAuth, controller.listMine);
router.patch('/read-all', requireAuth, controller.markAllRead);
router.patch('/:id/read', requireAuth, controller.markOneRead);

module.exports = router;
