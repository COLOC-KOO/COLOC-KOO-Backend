const router = require('express').Router();

router.use('/', require('./health.routes'));
router.use('/meta', require('./meta.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/annonces', require('./annonces.routes'));
router.use('/favoris', require('./favoris.routes'));
router.use('/candidatures', require('./candidatures.routes'));
router.use('/partenaires', require('./partenaires.routes'));
router.use('/contact', require('./contact.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/messages', require('./messages.routes'));
router.use('/backoffice', require('./backoffice.routes'));
router.use('/equipes', require('./equipes.routes'));
router.use('/demandes-service', require('./demandesService.routes'));

module.exports = router;
