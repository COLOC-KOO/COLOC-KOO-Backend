const cron = require('node-cron');
const { query } = require('../Services/db.service');
const { veutEmailPourEvenement, veutPushPourEvenement } = require('../Controllers/preferences.helper');
const { sendEmail, wrapLayout, detailsTable, actionButton } = require('../Services/mail.service');

// Vérification et traitement des annonces expirées
async function traiterAnnoncesExpirees() {
  console.log('[cron:expired] verification des annonces arrivees a expiration...');

  try {
    const annonces = await query(
      `SELECT
         a.id_annonce,
         a.titre,
         a.reference,
         a.date_expiration,
         u.id_utilisateur,
         u.email,
         u.prenom,
         u.nom
       FROM annonces a
       JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
       WHERE a.statut = 'active'
         AND a.date_expiration IS NOT NULL
         AND a.date_expiration < NOW()`
    );

    console.log('[cron:expired]', annonces.length, 'annonce(s) arrivee(s) a expiration');

    for (const annonce of annonces) {
      // 1. Passe le statut de l'annonce à 'expired'
      await basculerStatutExpire(annonce.id_annonce);

      // 2. Vérifie directement dans la table 'notifications' si le rappel a déjà été envoyé aujourd'hui
      const dejaEnvoye = await rappelDejaEnvoyeAujourdhui(annonce);
      if (dejaEnvoye) {
        console.log('[cron:expired] notification deja envoyee aujourd\'hui pour annonce', annonce.id_annonce, ', on saute');
        continue;
      }

      // 3. Envoie des alertes selon les préférences de l'utilisateur
      await envoyerEmailExpiration(annonce);
      await envoyerNotificationPushExpiration(annonce);
    }

    console.log('[cron:expired] traitement termine');
  } catch (err) {
    console.error('[cron:expired] erreur lors de la verification:', err);
  }
}

async function basculerStatutExpire(idAnnonce) {
  try {
    await query(
      `UPDATE annonces SET statut = 'expired' WHERE id_annonce = ? AND statut = 'active'`,
      [idAnnonce]
    );
    console.log('[cron:expired] annonce', idAnnonce, 'passee au statut expired');
  } catch (err) {
    console.error('[cron:expired] impossible de mettre a jour le statut pour annonce', idAnnonce, ':', err);
  }
}

// Vérification anti-doublon directement dans la table 'notifications'
async function rappelDejaEnvoyeAujourdhui(annonce) {
  const rows = await query(
    `SELECT 1 FROM notifications 
     WHERE id_utilisateur = ? 
       AND type_notification = 'systeme' 
       AND titre = 'Votre annonce a expiré'
       AND lien = ?
       AND DATE(date_creation) = CURDATE()
     LIMIT 1`,
    [annonce.id_utilisateur, `/annonces/${annonce.id_annonce}/renouveler`]
  );
  return rows.length > 0;
}

async function envoyerNotificationPushExpiration(annonce) {
  const veutPush = await veutPushPourEvenement(annonce.id_utilisateur, 'expired');
  if (!veutPush) {
    console.log('[cron:expired] utilisateur', annonce.id_utilisateur, 'a desactive le push pour expired, annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  try {
    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'systeme', ?, ?, ?)`,
      [
        annonce.id_utilisateur,
        'Votre annonce a expiré',
        `Votre annonce "${annonce.titre}" a expiré et n'est plus visible. Renouvelez-la pour continuer à recevoir des demandes.`,
        `/annonces/${annonce.id_annonce}/renouveler`,
      ]
    );
    console.log('[cron:expired] notification push creee pour utilisateur', annonce.id_utilisateur, ', annonce', annonce.id_annonce);
  } catch (err) {
    console.error('[cron:expired] echec creation notification push pour annonce', annonce.id_annonce, ':', err);
  }
}

async function envoyerEmailExpiration(annonce) {
  if (!annonce.email) {
    console.log('[cron:expired] pas d\'email pour l\'utilisateur', annonce.id_utilisateur, ', annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  const veutEmail = await veutEmailPourEvenement(annonce.id_utilisateur, 'expired');
  if (!veutEmail) {
    console.log('[cron:expired] utilisateur', annonce.id_utilisateur, 'a desactive l\'email pour expired, annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  const nom = annonce.prenom || '';
  const dateExpirationFormatee = annonce.date_expiration
    ? new Date(annonce.date_expiration).toLocaleDateString('fr-FR')
    : '';

  const html = wrapLayout(
    'Votre annonce a expiré',
    `<p>Bonjour ${nom},</p>
     <p>Votre annonce <strong>${annonce.titre}</strong> a expiré${dateExpirationFormatee ? ` le ${dateExpirationFormatee}` : ''} et n'est plus visible par les colocataires potentiels.</p>
     <p>Vous pouvez la renouveler dès maintenant pour qu'elle redevienne active.</p>
     ${detailsTable([
       ['Référence', annonce.reference],
       ['Titre', annonce.titre],
       ['Date d\'expiration', dateExpirationFormatee],
     ])}
     ${actionButton('Renouveler mon annonce', `/annonces/${annonce.id_annonce}/renouveler`)}`
  );

  try {
    await sendEmail(
      annonce.email,
      'Votre annonce a expiré — demande de renouvellement',
      html,
      `Votre annonce ${annonce.titre} a expire. Renouvelez-la pour qu'elle redevienne visible.`
    );
    console.log('[cron:expired] email envoye a', annonce.email, 'pour annonce', annonce.id_annonce);
  } catch (err) {
    console.error('[cron:expired] echec envoi email pour annonce', annonce.id_annonce, ':', err);
  }
}

// Exécution planifiée du CRON (ex: tous les jours à 10h21)
function demarrerCronExpired() {
  cron.schedule('23 11 * * *', () => {
    traiterAnnoncesExpirees();
  });
  console.log('[cron:expired] tache planifiee demarree');
}

module.exports = { demarrerCronExpired, traiterAnnoncesExpirees };