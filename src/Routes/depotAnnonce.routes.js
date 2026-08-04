const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = require('express').Router();
const controller = require('../Controllers/depotAnnonce.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'depot-annonce');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`);
  },
});

const upload = multer({ storage });

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/upload', requireAuth, upload.array('photos'), controller.uploadPhotos);
router.post('/', requireAuth, controller.create);

module.exports = router;

