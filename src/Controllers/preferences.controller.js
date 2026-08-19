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

function verifierProprietaire(req, res) {
  const idCible = String(req.params.idUtilisateur);
  const user = req.user;

  if (!user) return true;

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
        mode_allege: false,
        disponibilite_hors_ligne: true,
        evenements: DEFAULT_EVENTS,
      });
    }

    const pref = rows[0];

    res.json({
      mode_defaut: pref.mode_defaut || 'push',
      mode_allege: !!pref.mode_allege,
      disponibilite_hors_ligne: !!pref.disponibilite_hors_ligne,
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

    const modeAllege = b.mode_allege !== undefined ? !!b.mode_allege : false;
    const disponibiliteHorsLigne =
      b.disponibilite_hors_ligne !== undefined ? !!b.disponibilite_hors_ligne : true;

    const evenementsRaw = b.evenements || b.events;
    const evenements = JSON.stringify(
      Array.isArray(evenementsRaw) && evenementsRaw.length > 0 ? evenementsRaw : DEFAULT_EVENTS
    );

    await query(
      `INSERT INTO preferences_utilisateur
        (id_utilisateur, mode_defaut, mode_allege, disponibilite_hors_ligne, evenements)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        mode_defaut = VALUES(mode_defaut),
        mode_allege = VALUES(mode_allege),
        disponibilite_hors_ligne = VALUES(disponibilite_hors_ligne),
        evenements = VALUES(evenements)`,
      [idUtilisateur, modeDefaut, modeAllege ? 1 : 0, disponibiliteHorsLigne ? 1 : 0, evenements]
    );

    res.json({
      ok: true,
      mode_defaut: modeDefaut,
      mode_allege: modeAllege,
      disponibilite_hors_ligne: disponibiliteHorsLigne,
      evenements: JSON.parse(evenements),
    });
  } catch (err) {
    console.error('Erreur updatePreferences:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getPreferences, updatePreferences };