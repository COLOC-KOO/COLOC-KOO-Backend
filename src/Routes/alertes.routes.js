// src/Routes/alertes.routes.js
const express = require('express');
const router = express.Router();

const {
  getAlertes,
  createAlerte,
  updateNotifications,
  deleteAlerte,
} = require('../Controllers/alertes.controller.js');

// GET /api/alertes/:idUtilisateur
router.get('/alertes/:idUtilisateur', getAlertes);

// POST /api/alertes
router.post('/alertes', createAlerte);

// PATCH /api/alertes/:id/notifications
router.patch('/alertes/:id/notifications', updateNotifications);

// DELETE /api/alertes/:id
router.delete('/alertes/:id', deleteAlerte);

module.exports = router;

