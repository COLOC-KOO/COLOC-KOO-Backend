const router = require('express').Router();
const controller = require('../Controllers/notifications.controller');
const { requireAuth } = require('../Middleware/auth.middleware');

// ------------------------------------------------------------------
// 🧪 ROUTE DE TEST — À SUPPRIMER APRÈS VÉRIFICATION
// Permet de déclencher un notifyUser DEPUIS le serveur qui a les WS ouverts.
// ------------------------------------------------------------------
router.post('/_test/notify/:userId', async (req, res) => {
  try {
    const { notifyUser } = require('../Services/notify.service');
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'userId invalide' });

    await notifyUser(userId, {
      titre: req.body?.titre || 'Live!',
      texte: req.body?.texte || 'Sans refresh ✨',
      type: req.body?.type || 'systeme',
    });

    res.json({ ok: true, userId });
  } catch (err) {
    console.error('[_test/notify] erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Routes existantes
// ------------------------------------------------------------------
router.get('/', requireAuth, controller.listMine);
router.patch('/read-all', requireAuth, controller.markAllRead);
router.patch('/:id/read', requireAuth, controller.markOneRead);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;