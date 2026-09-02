const cron = require('node-cron');
const { query } = require('../Services/db.service');
const { veutEmailPourEvenement, veutPushPourEvenement } = require('../Controllers/preferences.helper');
const { sendEmail, wrapLayout, detailsTable, actionButton } = require('../Services/mail.service');

// Vérification des annonces expirant dans 7 jours (J-7)
async function verifierAnnoncesExpirantJ7() {
  console.log('[cron:expire_j7] verification des annonces expirant dans 7 jours...');

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
         AND DATE(a.date_expiration) >= CURDATE()
         AND DATEDIFF(a.date_expiration, NOW()) = 7`
    );
    console.log('[cron:expire_j7]', annonces.length, 'annonce(s) trouvee(s) expirant dans 7 jours');

    for (const annonce of annonces) {
      // Vérification anti-doublon directement dans la table 'notifications'
      const dejaEnvoye = await rappelDejaEnvoyeAujourdhui(annonce);
      if (dejaEnvoye) {
        console.log('[cron:expire_j7] rappel deja envoye aujourd\'hui pour annonce', annonce.id_annonce, ', on saute');
        continue;
      }

      await envoyerRappelExpiration(annonce);
      await envoyerNotificationPush(annonce);
    }

    console.log('[cron:expire_j7] traitement termine');
  } catch (err) {
    console.error('[cron:expire_j7] erreur lors de la verification:', err);
  }
}

// Vérification anti-doublon basée sur la table 'notifications'
async function rappelDejaEnvoyeAujourdhui(annonce) {
  const rows = await query(
    `SELECT 1 FROM notifications 
     WHERE id_utilisateur = ? 
       AND type_notification = 'systeme' 
       AND titre = 'Votre annonce expire bientôt'
       AND lien = ?
       AND DATE(date_creation) = CURDATE()
     LIMIT 1`,
    [annonce.id_utilisateur, `/annonces/${annonce.id_annonce}/renouveler`]
  );
  return rows.length > 0;
}

async function envoyerNotificationPush(annonce) {
  const veutPush = await veutPushPourEvenement(annonce.id_utilisateur, 'expire_j7');
  if (!veutPush) {
    console.log('[cron:expire_j7] utilisateur', annonce.id_utilisateur, 'a desactive le push pour expire_j7, annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  const dateExpirationFormatee = annonce.date_expiration
    ? new Date(annonce.date_expiration).toLocaleDateString('fr-FR')
    : 'bientôt';

  try {
    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'systeme', ?, ?, ?)`,
      [
        annonce.id_utilisateur,
        'Votre annonce expire bientôt',
        `Votre annonce "${annonce.titre}" expire le ${dateExpirationFormatee}. Pensez à la renouveler.`,
        `/annonces/${annonce.id_annonce}/renouveler`,
      ]
    );
    console.log('[cron:expire_j7] notification push creee pour utilisateur', annonce.id_utilisateur, ', annonce', annonce.id_annonce);
  } catch (err) {
    console.error('[cron:expire_j7] echec creation notification push pour annonce', annonce.id_annonce, ':', err);
  }
}

async function envoyerRappelExpiration(annonce) {
  if (!annonce.email) {
    console.log('[cron:expire_j7] pas d\'email pour l\'utilisateur', annonce.id_utilisateur, ', annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  const veutEmail = await veutEmailPourEvenement(annonce.id_utilisateur, 'expire_j7');
  if (!veutEmail) {
    console.log('[cron:expire_j7] utilisateur', annonce.id_utilisateur, 'a desactive l\'email pour expire_j7, annonce', annonce.id_annonce, 'ignoree');
    return;
  }

  const nom = annonce.prenom || '';
  const dateExpirationFormatee = annonce.date_expiration
    ? new Date(annonce.date_expiration).toLocaleDateString('fr-FR')
    : 'bientôt';

  const html = wrapLayout(
    'Votre annonce expire dans 7 jours',
    `<p>Bonjour ${nom},</p>
     <p>Votre annonce <strong>${annonce.titre}</strong> arrivera à expiration le <strong>${dateExpirationFormatee}</strong>.</p>
     <p>Pensez à la renouveler pour qu'elle reste visible par les colocataires potentiels.</p>
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
      'Votre annonce expire dans 7 jours',
      html,
      `Votre annonce ${annonce.titre} expire le ${dateExpirationFormatee}. Pensez a la renouveler.`
    );
    console.log('[cron:expire_j7] email envoye a', annonce.email, 'pour annonce', annonce.id_annonce);
  } catch (err) {
    console.error('[cron:expire_j7] echec envoi email pour annonce', annonce.id_annonce, ':', err);
  }
}

// Planification tous les jours à 8h00
function demarrerCronExpireJ7() {
  cron.schedule('50 08 * * *', () => {
    verifierAnnoncesExpirantJ7();
  });
  console.log('[cron:expire_j7] tache planifiee demarree (tous les jours a 8h00)');
}

module.exports = { demarrerCronExpireJ7, verifierAnnoncesExpirantJ7 };