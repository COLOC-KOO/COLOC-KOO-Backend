const express = require('express');
const router = express.Router();

const { getPreferences, updatePreferences } = require('../Controllers/preferences.controller.js');

const { requireAuth } = require('../Middleware/auth.middleware');

router.get('/:idUtilisateur', requireAuth, getPreferences);
router.put('/:idUtilisateur', requireAuth, updatePreferences);

module.exports = router;
