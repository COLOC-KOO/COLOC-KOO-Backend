const router = require('express').Router();
const controller = require('../Controllers/messages.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.use(requireAuth);

router.get('/', controller.listThreads);
router.delete('/thread/:userId', controller.removeThread);
router.get('/:userId', controller.getThread);
router.post('/', controller.send);
router.post('/:id/report', controller.report);
router.delete('/:id', controller.removeMessage);

module.exports = router;
