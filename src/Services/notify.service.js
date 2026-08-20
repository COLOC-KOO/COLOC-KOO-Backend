// 
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
  console.log('[notify] insertInApp() -> userId:', userId, '| type:', typeValide(type), '| titre:', titre);
  await query(
    `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, typeValide(type), titre, texte, lien]
  ).catch((err) => {
    console.error('[notify] insertInApp() ECHEC pour userId:', userId, '-', err.message);
  });
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
  console.log('[notify] getStaffRecipients() -> roles recherches:', list);
  const rows = await query(
    `SELECT u.id_utilisateur, u.email, u.prenom, u.nom
     FROM utilisateurs u
     JOIN roles r ON r.id_role = u.id_role
     WHERE r.nom_role IN (${placeholders}) AND u.statut = 'active'`,
    list
  );
  console.log('[notify] getStaffRecipients() -> resultat :', rows.length, 'utilisateur(s) trouve(s)');
  rows.forEach((r) => console.log('[notify]   -', r.email, '(id:', r.id_utilisateur + ')'));
  return rows;
}

// Notifie le staff : in-app + un email groupe. Par defaut admin + super_admin ;
// passer `roles` pour cibler d'autres roles (ex. ['moderator','admin','super_admin']).
// Options : voir l'entete du fichier.
async function notifyStaff({ titre, texte, lien = null, type = 'systeme', intro = null, details = null, contenuHtml = null, action = null, roles = STAFF_ROLES }) {
  console.log('[notify] notifyStaff() appele -> titre:', titre, '| roles:', roles);
  try {
    const staff = await getStaffRecipients(roles);
    if (!staff.length) {
      console.warn('[notify] notifyStaff() -> AUCUN staff trouve pour les roles:', roles, '. Verifie la table roles/utilisateurs (statut = active ?).');
      return;
    }

    // 1) In-app pour chaque membre du staff.
    for (const s of staff) {
      await insertInApp(s.id_utilisateur, type, titre, texte, lien);
    }

    // 2) Email groupe (best-effort).
    const emails = [...new Set(staff.map((s) => s.email).filter(Boolean))];
    console.log('[notify] notifyStaff() -> emails cibles pour l\'envoi groupe :', emails);
    if (emails.length) {
      const html = buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action });
      const ok = await mail.sendEmail(emails, titre, html, texte);
      console.log('[notify] notifyStaff() -> mail.sendEmail() a retourne :', ok);
    } else {
      console.warn('[notify] notifyStaff() -> aucun email valide parmi le staff, envoi annule.');
    }
  } catch (err) {
    console.error('[notify] notifyStaff() ECHEC GENERAL :', err.message);
  }
}

// Notifie UN utilisateur precis : in-app + email (best-effort).
// Memes options que notifyStaff (voir entete). `email` peut e^tre fourni pour
// eviter une requete si l'appelant l'a deja.
async function notifyUser(userId, { titre, texte, lien = null, type = 'systeme', intro = null, details = null, contenuHtml = null, action = null, email = null }) {
  console.log('[notify] notifyUser() appele -> userId:', userId, '| titre:', titre);
  try {
    if (!userId) {
      console.warn('[notify] notifyUser() -> userId manquant, abandon.');
      return;
    }
    await insertInApp(userId, type, titre, texte, lien);

    let destinataire = email;
    if (!destinataire) {
      const [u] = await query('SELECT email FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1', [userId]);
      destinataire = u && u.email ? u.email : null;
    }
    console.log('[notify] notifyUser() -> destinataire email :', destinataire);
    if (destinataire) {
      const html = buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action });
      const ok = await mail.sendEmail(destinataire, titre, html, texte);
      console.log('[notify] notifyUser() -> mail.sendEmail() a retourne :', ok);
    } else {
      console.warn('[notify] notifyUser() -> aucun email trouve pour userId:', userId, ', envoi annule.');
    }
  } catch (err) {
    console.error('[notify] notifyUser() ECHEC GENERAL :', err.message);
  }
}


// Envoie UNIQUEMENT un email a un utilisateur, sans creer d'entree in-app.
// A utiliser quand l'utilisateur a explicitement demande "email seul"
// (ex: notif_push=false, notif_email=true) pour ne pas polluer sa cloche
// de notifications avec une entree qu'il n'a pas demandee.
async function sendEmailOnly(userId, { titre, texte, lien = null, intro = null, details = null, contenuHtml = null, action = null, email = null }) {
  console.log('[notify] sendEmailOnly() appele -> userId:', userId, '| titre:', titre);
  try {
    if (!userId) {
      console.warn('[notify] sendEmailOnly() -> userId manquant, abandon.');
      return;
    }

    let destinataire = email;
    if (!destinataire) {
      const [u] = await query('SELECT email FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1', [userId]);
      destinataire = u && u.email ? u.email : null;
    }
    console.log('[notify] sendEmailOnly() -> destinataire email :', destinataire);
    if (destinataire) {
      const html = buildEmailHtml({ titre, texte, intro, details, contenuHtml, lien, action });
      const ok = await mail.sendEmail(destinataire, titre, html, texte);
      console.log('[notify] sendEmailOnly() -> mail.sendEmail() a retourne :', ok);
    } else {
      console.warn('[notify] sendEmailOnly() -> aucun email trouve pour userId:', userId, ', envoi annule.');
    }
  } catch (err) {
    console.error('[notify] sendEmailOnly() ECHEC GENERAL :', err.message);
  }
}

module.exports = { notifyStaff, notifyUser, getStaffRecipients, insertInApp, sendEmailOnly };