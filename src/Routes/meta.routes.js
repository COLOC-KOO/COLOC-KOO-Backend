const router = require('express').Router();
const controller = require('../Controllers/meta.controller');

router.get('/roles', controller.listRoles);
router.get('/langues', controller.listLangues);
router.get('/regions', controller.listRegions);
router.get('/villes', controller.listVilles);
router.get('/services', controller.listServices);

module.exports = router;
