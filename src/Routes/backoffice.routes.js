const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../Controllers/backoffice.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');
// Importer les routes des campagnes
const campagnesRoutes = require('./campagnes.routes');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin', 'moderator'));

router.get('/dashboard', controller.dashboard);
router.get('/annonces', controller.queue);
router.get('/membres', controller.members);
router.get('/stats', controller.stats);
router.get('/signalements', controller.signalements);
router.get('/signalements/:id/conversation', controller.signalementConversation);
router.patch('/signalements/:id', controller.updateSignalement);
router.get('/warning-reasons', controller.warningReasons);
router.post('/warnings', controller.sendWarning);
router.get('/conversations', controller.conversations);
router.get('/conversations/:a/:b', controller.conversationMessages);
router.get('/messages-contact', controller.contactMessages);
router.delete('/messages-contact/:id', controller.deleteContactMessage);
router.post('/messages-contact/:id/reply', controller.replyContactMessage);
router.get('/journal', controller.journal);
router.delete('/journal/:id', controller.deleteJournalEntry);
router.get('/suivi-missions', controller.suiviMissions);
router.get('/services-ckoo', controller.servicesCkoo);
router.post('/services-ckoo', controller.createServiceCkoo);
router.patch('/services-ckoo/:id', controller.updateServiceCkoo);
router.delete('/services-ckoo/:id', controller.deleteServiceCkoo);
router.get('/partenaires', controller.partenaires);
router.get('/partenaires/requests', controller.partenaireRequests);
router.delete('/partenaires/requests/:id', controller.deletePartenaireRequest);
router.get('/statistiques-colocation', controller.statistiquesColocation);
router.post('/partenaires/upload', upload.single('logo'), controller.uploadPartenaireLogo);
router.post('/partenaires', controller.createPartenaire);
router.patch('/partenaires/:id', controller.updatePartenaire);
router.delete('/partenaires/:id', controller.deletePartenaire);
router.get('/contrats', controller.contrats);
router.get('/contrats/:id', controller.contratDetails);
router.post('/contrats', controller.saveContrat);
router.patch('/contrats/:id', controller.saveContrat);
router.post('/contrats/:id/:action', controller.contratAction);
router.get('/partenaires/stats', controller.partenairesStats);
router.get('/paiements', controller.backofficePaiements);
router.get('/administration', controller.administration);
router.get('/performance', controller.backofficePerformance);
router.post('/administration/configuration', controller.saveConfiguration);
router.post('/administration/objectifs', controller.saveObjectif);
router.patch('/administration/objectifs/:id', controller.saveObjectif);
router.post('/membres', controller.createMember);
router.patch('/membres/:id', controller.updateMember);
router.delete('/membres/:id', controller.deleteMember);
router.patch('/annonces/:id/status', controller.moderateAnnonce);
router.patch('/paiements/:id/status', controller.updatePaiementStatus);
router.patch('/members/:id/status', controller.moderateMember);
// ===== ROUTES DES CAMPAGNES =====
router.use('/campagnes', campagnesRoutes);

module.exports = router;
