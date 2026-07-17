const { query } = require('./db.service');
const mail = require('./mail.service');

// type_notification autorises par la table (enum). On borne pour eviter une
// erreur SQL si un appelant passe une valeur libre.
const TYPES_VALIDES = ['message', 'candidature', 'systeme'];
function typeValide(type) {
  return TYPES_VALIDES.includes(type) ? type : 'systeme';
}

// Insere une ligne dans `notifications` (best-effort).
async function insertInApp(userId, type, titre, texte, lien) {
  await query(
    `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, typeValide(type), titre, texte, lien]
  ).catch(() => {});
}

// Construit le HTML final d'un email de notification (corps + bouton),
// enrobe dans le gabarit de marque.
// Corps : `contenuHtml` (echappatoire) sinon compose depuis intro + details ;
// a defaut, retombe sur `texte`.
function buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action }) {
  let corps;
  if (contenuHtml) {
    corps = contenuHtml;
  } else {
    corps = '';
    if (intro) corps += `<p>${intro}</p>`;
    if (Array.isArray(details) && details.length) corps += mail.detailsTable(details);
    if (!corps) corps = `<p>${texte}</p>`;
  }

  let bouton = '';
  if (action && action.label && action.path) {
    bouton = mail.actionButton(action.label, action.path);
  } else if (lien) {
    bouton = mail.actionButton('Ouvrir', lien);
  }
  return mail.wrapLayout(titre, corps + bouton);
}

// Roles staff par defaut (gestion). Pour la MODERATION (ex. file de validation
// des annonces), passer roles: ['moderator', 'admin', 'super_admin'].
const STAFF_ROLES = ['admin', 'super_admin'];

// Destinataires staff actifs pour les roles donnes.
async function getStaffRecipients(roles = STAFF_ROLES) {
  const list = Array.isArray(roles) && roles.length ? roles : STAFF_ROLES;
  const placeholders = list.map(() => '?').join(',');
  return query(
    `SELECT u.id_utilisateur, u.email, u.prenom, u.nom
     FROM utilisateurs u
     JOIN roles r ON r.id_role = u.id_role
     WHERE r.nom_role IN (${placeholders}) AND u.statut = 'active'`,
    list
  );
}

// Notifie le staff : in-app + un email groupe. Par defaut admin + super_admin ;
// passer `roles` pour cibler d'autres roles (ex. ['moderator','admin','super_admin']).
// Options : voir l'entete du fichier.
async function notifyStaff({ titre, texte, lien = null, type = 'systeme', intro = null, details = null, contenuHtml = null, action = null, roles = STAFF_ROLES }) {
  try {
    const staff = await getStaffRecipients(roles);
    if (!staff.length) return;

    // 1) In-app pour chaque membre du staff.
    for (const s of staff) {
      await insertInApp(s.id_utilisateur, type, titre, texte, lien);
    }

    // 2) Email groupe (best-effort).
    const emails = [...new Set(staff.map((s) => s.email).filter(Boolean))];
    if (emails.length) {
      const html = buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action });
      await mail.sendEmail(emails, titre, html, texte);
    }
  } catch (err) {
    console.error('[notify] notifyStaff:', err.message);
  }
}

// Notifie UN utilisateur precis : in-app + email (best-effort).
// Memes options que notifyStaff (voir entete). `email` peut e^tre fourni pour
// eviter une requete si l'appelant l'a deja.
async function notifyUser(userId, { titre, texte, lien = null, type = 'systeme', intro = null, details = null, contenuHtml = null, action = null, email = null }) {
  try {
    if (!userId) return;
    await insertInApp(userId, type, titre, texte, lien);

    let destinataire = email;
    if (!destinataire) {
      const [u] = await query('SELECT email FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1', [userId]);
      destinataire = u && u.email ? u.email : null;
    }
    if (destinataire) {
      const html = buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action });
      await mail.sendEmail(destinataire, titre, html, texte);
    }
  } catch (err) {
    console.error('[notify] notifyUser:', err.message);
  }
}

module.exports = { notifyStaff, notifyUser, getStaffRecipients };
