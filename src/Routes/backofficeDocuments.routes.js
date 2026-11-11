const router = require('express').Router();
const controller = require('../Controllers/documents.controller');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.use(requireAuth, requireRole('admin', 'super_admin', 'moderator'));
router.get('/clauses', controller.listBackofficeClauses);
router.post('/clauses', controller.createBackofficeClause);
router.patch('/clauses/:id', controller.updateBackofficeClause);
router.get('/', controller.listBackoffice);
router.get('/:id/payment-proof', controller.getBackofficePaymentProof);
router.patch('/:id', controller.updateBackoffice);

module.exports = router;
