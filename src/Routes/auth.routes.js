const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = require('express').Router();
const controller = require('../Controllers/auth.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

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
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, controller.updateMe);
router.post('/me/upload', requireAuth, upload.single('photo'), controller.uploadProfilePicture);
router.patch('/me/password', requireAuth, controller.changePassword);

module.exports = router;
