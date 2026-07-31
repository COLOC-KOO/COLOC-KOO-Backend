const router = require('express').Router();
const controller = require('../Controllers/groupes.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.use(requireAuth);

router.get('/', controller.listGroups);
router.post('/', controller.createGroup);
router.delete('/:id', controller.removeGroup);
router.get('/:id/messages', controller.getMessages);
router.post('/:id/messages', controller.sendMessage);
router.post('/:id/messages/:messageId/report', controller.reportMessage);

module.exports = router;
