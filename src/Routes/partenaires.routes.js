const router = require('express').Router();
const controller = require('../Controllers/partenaires.controller');
const campagnesController = require('../Controllers/campagnes.controller');

router.get('/', controller.list);
router.get('/campaigns', campagnesController.listPublic);
router.post('/requests', controller.createRequest);

module.exports = router;
