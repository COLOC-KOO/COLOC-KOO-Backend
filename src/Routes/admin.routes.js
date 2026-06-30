// src/Routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../Controllers/admin.controller');
const { authenticateToken, requireRole } = require('../Middleware/auth.middleware');

// =============================================
// ROUTES PUBLIQUES (Pas de token requis)
// =============================================

// Créer un administrateur - PUBLIC
router.post('/', adminController.createAdmin);

// Vérifier si des admins existent - PUBLIC
router.get('/check', adminController.checkAdminsExist);

// =============================================
// ROUTES PROTÉGÉES (Token requis)
// =============================================

// Appliquer les middlewares pour toutes les routes suivantes
router.use(authenticateToken);

// TOUS les rôles peuvent accéder (admin, manager, receptioniste, caisse, water, housekeeping)
router.use(requireRole(['admin', 'manager', 'receptioniste', 'caisse', 'water', 'housekeeping']));

// Routes CRUD
router.get('/', adminController.getAllAdmins);
router.get('/:id', adminController.getAdminById);
router.put('/:id', adminController.updateAdmin);
router.delete('/:id', adminController.deleteAdmin);

// Routes spécifiques
router.patch('/:id/status', adminController.changeAdminStatus);
router.post('/:id/reset-password', adminController.resetPassword);

// Route pour récupérer les admins par rôle
router.get('/role/:role', adminController.getAdminsByRole);

module.exports = router;