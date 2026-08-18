const express = require('express');
const router = express.Router();

const { getPreferences, updatePreferences } = require('../Controllers/preferences.controller.js');

// Adaptez cet import au nom réel de votre middleware d'auth existant
// (ex: celui utilisé pour protéger /auth/me dans le reste de l'app).
// Il doit poser req.user = { id_utilisateur, poste, ... } à partir du JWT.
const { verifyToken } = require('../Middlewares/auth.middleware.js');

router.get('/:idUtilisateur', verifyToken, getPreferences);
router.put('/:idUtilisateur', verifyToken, updatePreferences);

module.exports = router;

