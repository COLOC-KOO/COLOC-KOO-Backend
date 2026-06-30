const router = require('express').Router();
const controller = require('../Controllers/auth.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, controller.updateMe);
router.patch('/me/password', requireAuth, controller.changePassword);

module.exports = router;
