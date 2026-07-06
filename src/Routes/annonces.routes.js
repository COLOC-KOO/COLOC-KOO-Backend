const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = require('express').Router();
const controller = require('../Controllers/annonces.controller');
const { requireAuth, requireRole, optionalAuth } = require('../Middleware/auth.middleware');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/', optionalAuth, controller.list);
router.get('/:id', controller.getById);
router.post('/upload', requireAuth, upload.array('photos', 12), controller.uploadPhotos);
router.post('/', requireAuth, controller.create);
router.patch('/:id', requireAuth, controller.update);
router.patch('/:id/status', requireAuth, requireRole('admin', 'super_admin', 'moderator'), controller.updateStatus);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;
