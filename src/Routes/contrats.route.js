const router = require('express').Router();
const { query } = require('../Services/db.service');
const { sendContractDocuments } = require('../Services/contract-pdf.service');
const { requireAuth, requireRole } = require('../Middleware/auth.middleware');

router.post('/:id/email', requireAuth, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const contractId = Number(req.params.id);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return res.status(400).json({ success: false, message: 'Contrat invalide.' });
    }

    const rows = await query('SELECT id_contrat FROM contrats WHERE id_contrat = ? LIMIT 1', [contractId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Contrat introuvable.' });
    }
    const result = await sendContractDocuments(contractId);
    if (result.failures.length) {
      return res.status(502).json({
        success: false,
        message: `Envoi partiel : ${result.sent} e-mail(s) envoyé(s), ${result.failures.length} échec(s).`,
        sent: result.sent,
        failures: result.failures,
      });
    }

    return res.json({
      success: true,
      message: `Document PDF envoyé à ${result.sent} partie(s).`,
      count: result.sent,
      destinataires: result.destinataires,
      pdfCount: result.pdfCount,
      archiveCount: result.pdfCount,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
});

module.exports = router;
