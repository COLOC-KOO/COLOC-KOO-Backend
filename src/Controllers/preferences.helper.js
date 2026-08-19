const { query } = require('../Services/db.service');

const DEFAULT_EVENTS = [
  { id: 'new_msg', push: true, email: true },
  { id: 'expire_j7', push: true, email: true },
  { id: 'expired', push: true, email: true },
  { id: 'alert_match', push: true, email: true },
  { id: 'msg_auto', push: true, email: null },
  { id: 'msg_blocked', push: true, email: null },
  { id: 'pub_confirm', push: true, email: true },
];

//email
async function veutEmailPourEvenement(idUtilisateur, eventId) {
  const pref = await getPreferenceEvenement(idUtilisateur, eventId);
  if (!pref) return true; // événement inconnu -> comportement par défaut = on envoie
  return pref.email === true;
}

// push in app
async function veutPushPourEvenement(idUtilisateur, eventId) {
  const pref = await getPreferenceEvenement(idUtilisateur, eventId);
  if (!pref) return true; // événement inconnu -> comportement par défaut = on envoie
  return pref.push === true;
}

async function getPreferenceEvenement(idUtilisateur, eventId) {
  try {
    const rows = await query(
      'SELECT evenements FROM preferences_utilisateur WHERE id_utilisateur = ? LIMIT 1',
      [idUtilisateur]
    );

    let evenements = DEFAULT_EVENTS;
    if (rows.length && rows[0].evenements) {
      evenements = typeof rows[0].evenements === 'string'
        ? JSON.parse(rows[0].evenements)
        : rows[0].evenements;
    }

    return evenements.find((e) => e.id === eventId) || null;
  } catch (err) {
    console.error(`[preferences] erreur lecture preferences (user ${idUtilisateur}, event ${eventId}):`, err);
    return null; // en cas d'erreur, on ne bloque pas l'envoi (fail-open dans les fonctions appelantes)
  }
}

module.exports = { veutEmailPourEvenement, veutPushPourEvenement, DEFAULT_EVENTS };