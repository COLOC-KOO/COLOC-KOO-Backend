const router = require('express').Router();
const controller = require('../Controllers/backoffice.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin', 'moderator'));

router.get('/dashboard', controller.dashboard);
router.get('/annonces', controller.queue);
router.get('/membres', controller.members);
router.get('/stats', controller.stats);
router.patch('/annonces/:id/status', controller.moderateAnnonce);
router.patch('/members/:id/status', controller.moderateMember);

module.exports = router;
