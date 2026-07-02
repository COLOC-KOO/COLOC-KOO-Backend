const router = require('express').Router();
const controller = require('../Controllers/messages.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.use(requireAuth);

router.get('/', controller.listThreads);
router.get('/:userId', controller.getThread);
router.post('/', controller.send);
router.post('/:id/report', controller.report);

module.exports = router;
