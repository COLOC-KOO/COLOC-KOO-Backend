const router = require('express').Router();
const multer = require('multer');
const controller = require('../Controllers/documents.controller');
const { requireAuth } = require('../Middleware/auth.middleware');
router.get('/download/:token', controller.downloadByToken);

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    if (!allowedImageTypes.has(file.mimetype)) {
      return callback(new Error('La capture doit être une image PNG, JPEG ou WebP.'));
    }
    callback(null, true);
  },
});

function receivePaymentProof(req, res, next) {
  uploadProof.single('preuve')(req, res, (error) => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({
      message: status === 413
        ? 'La capture ne doit pas dépasser 5 Mo.'
        : error.message || 'Impossible de recevoir la capture de paiement.',
    });
  });
}

router.use(requireAuth);
router.get('/mine', controller.listMine);
router.post('/:id/download-link', controller.createDownloadLink);
router.delete('/:id', controller.deleteMine);
router.post('/preview', controller.preview);
router.post('/', controller.createDraft);
router.post('/:id/payment', receivePaymentProof, controller.submitPayment);

module.exports = router;
