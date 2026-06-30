const router = require('express').Router();
const controller = require('../Controllers/favoris.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

router.get('/', requireAuth, controller.list);
router.post('/:idAnnonce', requireAuth, controller.toggle);
router.delete('/:idAnnonce', requireAuth, controller.remove);

module.exports = router;
