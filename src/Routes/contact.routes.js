const router = require('express').Router();
const controller = require('../Controllers/contact.controller');

router.post('/', controller.create);

module.exports = router;
