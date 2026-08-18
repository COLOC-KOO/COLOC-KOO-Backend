const { query } = require('../Services/db.service.js');

const DEFAULT_EVENTS = [
  { id: 'new_msg', push: true, email: true },
  { id: 'expire_j7', push: true, email: true },
  { id: 'expired', push: true, email: true },
  { id: 'alert_match', push: true, email: true },
  { id: 'msg_auto', push: true, email: null },
  { id: 'msg_blocked', push: true, email: null },
  { id: 'pub_confirm', push: true, email: true },
];

const MODES_VALIDES = new Set(['push', 'email', 'both']);

function parseEvenements(raw) {
  if (!raw) return DEFAULT_EVENTS;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return DEFAULT_EVENTS;
  }
}

// NB: si un middleware d'auth pose req.user (ex: { id_utilisateur, poste }),
// on vérifie ici que l'utilisateur ne lit/écrit que SES PROPRES préférences
// (sauf rôle admin/superadmin), pour éviter qu'un id arbitraire dans l'URL
// permette de consulter/modifier les préférences d'un tiers.
function verifierProprietaire(req, res) {
  const idCible = String(req.params.idUtilisateur);
  const user = req.user;

  if (!user) return true; // pas de middleware d'auth branché sur cette route

  const estAdmin = ['admin', 'superadmin'].includes(user.poste);
  if (!estAdmin && String(user.id_utilisateur ?? user.id) !== idCible) {
    res.status(403).json({ error: 'Accès non autorisé à ces préférences' });
    return false;
  }
  return true;
}

async function getPreferences(req, res) {
  try {
    if (!verifierProprietaire(req, res)) return;

    const rows = await query(
      `SELECT * FROM preferences_utilisateur WHERE id_utilisateur = ? LIMIT 1`,
      [req.params.idUtilisateur]
    );

    if (!rows || rows.length === 0) {
      return res.json({
        mode_defaut: 'push',
        evenements: DEFAULT_EVENTS,
      });
    }

    const pref = rows[0];

    res.json({
      mode_defaut: pref.mode_defaut || 'push',
      evenements: parseEvenements(pref.evenements),
    });
  } catch (err) {
    console.error('Erreur getPreferences:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updatePreferences(req, res) {
  try {
    if (!verifierProprietaire(req, res)) return;

    const idUtilisateur = req.params.idUtilisateur;
    const b = req.body || {};

    const modeDefautBrut = b.mode_defaut || b.defaultMode || 'push';
    const modeDefaut = MODES_VALIDES.has(modeDefautBrut) ? modeDefautBrut : 'push';

    const evenementsRaw = b.evenements || b.events;
    const evenements = JSON.stringify(
      Array.isArray(evenementsRaw) && evenementsRaw.length > 0 ? evenementsRaw : DEFAULT_EVENTS
    );

    await query(
      `INSERT INTO preferences_utilisateur
        (id_utilisateur, mode_defaut, evenements)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
        mode_defaut = VALUES(mode_defaut),
        evenements = VALUES(evenements)`,
      [idUtilisateur, modeDefaut, evenements]
    );

    res.json({
      ok: true,
      mode_defaut: modeDefaut,
      evenements: JSON.parse(evenements),
    });
  } catch (err) {
    console.error('Erreur updatePreferences:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getPreferences, updatePreferences };