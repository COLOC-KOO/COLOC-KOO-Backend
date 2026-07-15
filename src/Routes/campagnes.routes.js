const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const campagnesController = require('../Controllers/campagnes.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

// Configuration de multer pour les uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'campagnes');
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Générer un nom unique : timestamp + nom original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `campagne-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// Routes pour les campagnes
// GET /api/backoffice/campagnes - Récupérer toutes les campagnes
router.get('/', requireAuth, requireRole('super_admin', 'admin'), campagnesController.listAll);

// GET /api/backoffice/campagnes/:id - Récupérer une campagne
router.get('/:id', requireAuth, requireRole('super_admin', 'admin'), campagnesController.getOne);

// POST /api/backoffice/campagnes - Créer une campagne
router.post('/', requireAuth, requireRole('super_admin', 'admin'), campagnesController.create);

// PATCH /api/backoffice/campagnes/:id - Mettre à jour une campagne
router.patch('/:id', requireAuth, requireRole('super_admin', 'admin'), campagnesController.update);

// DELETE /api/backoffice/campagnes/:id - Supprimer une campagne
router.delete('/:id', requireAuth, requireRole('super_admin', 'admin'), campagnesController.remove);

// POST /api/backoffice/campagnes/upload - Uploader un visuel
router.post('/upload', requireAuth, requireRole('super_admin', 'admin'), upload.single('visuel'), campagnesController.uploadVisuel);

module.exports = router;