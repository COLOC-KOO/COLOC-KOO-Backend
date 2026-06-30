const router = require('express').Router();
const controller = require('../Controllers/partenaires.controller');

router.get('/', controller.list);
router.post('/requests', controller.createRequest);

module.exports = router;
