const { query, insertAndGetId } = require('../Services/db.service');
const { sendEmail, wrapLayout, detailsTable, actionButton } = require('../Services/mail.service');
const { veutEmailPourEvenement } = require('./preferences.helper');

async function envoyerEmailNouveauMessage(message) {
  if (!message || !message.destinataire_email) {
    console.log('[messages] pas d\'email destinataire, envoi annule');
    return;
  }

  const veutEmail = await veutEmailPourEvenement(message.id_destinataire, 'new_msg');
  if (!veutEmail) {
    console.log('[messages] destinataire', message.id_destinataire, 'a desactive l\'email pour new_msg, envoi annule');
    return;
  }

  const expediteurNom = [message.expediteur_prenom, message.expediteur_nom].filter(Boolean).join(' ') || 'Un utilisateur';
  const destinataireNom = message.destinataire_prenom || '';

  const html = wrapLayout(
    'Nouveau message reçu',
    `<p>Bonjour ${destinataireNom},</p>
     <p><strong>${expediteurNom}</strong> vous a envoyé un message${message.annonce_titre ? ` à propos de l'annonce « ${message.annonce_titre} »` : ''}.</p>
     ${detailsTable([
       ['De', expediteurNom],
       ['Sujet', message.sujet],
       ['Message', message.contenu?.slice(0, 200)],
     ])}
     ${actionButton('Voir la conversation', `/compte?tab=messages&user=${message.id_expediteur}`)}`
  );

  await sendEmail(
    message.destinataire_email,
    `${expediteurNom} vous a envoyé un message`,
    html,
    `${expediteurNom} vous a envoyé un message : ${message.contenu?.slice(0, 200)}`
  );
}

async function listThreads(req, res, next) {
  try {
    const rows = await query(
      `SELECT
         CASE WHEN m.id_expediteur = ? THEN m.id_destinataire ELSE m.id_expediteur END AS interlocuteur_id,
         m.id_annonce,
         m.contenu AS dernier_message,
         m.date_envoi AS date_dernier_message,
         (m.id_expediteur = ?) AS est_dernier_message_mien,
         COUNT(*) AS total_messages,
         SUM(CASE WHEN m.id_destinataire = ? AND m.est_lu = 0 THEN 1 ELSE 0 END) AS non_lus,

         /* Nom et prénom du propriétaire de l'annonce */
         prop.nom AS proprietaire_nom,
         prop.prenom AS proprietaire_prenom,

         /* Nom et prénom de l'interlocuteur */
         CASE WHEN m.id_expediteur = ? THEN de.nom ELSE ex.nom END AS interlocuteur_nom,
         CASE WHEN m.id_expediteur = ? THEN de.prenom ELSE ex.prenom END AS interlocuteur_prenom,

         a.titre AS annonce_titre,
         a.quartier AS annonce_quartier,
         v.nom_ville AS annonce_ville,
         MIN(ch.prix_loyer) AS annonce_prix,
         MIN(pa.url) AS annonce_photo
       FROM messages m
       INNER JOIN (
         /* Sous-requête pour récupérer le dernier message exact par fil de discussion */
         SELECT
           CASE WHEN id_expediteur = ? THEN id_destinataire ELSE id_expediteur END AS sub_interlocuteur,
           MAX(id_message) AS max_id_message
         FROM messages
         WHERE id_expediteur = ? OR id_destinataire = ?
         GROUP BY sub_interlocuteur
       ) last_msg ON m.id_message = last_msg.max_id_message

       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces a ON a.id_annonce = m.id_annonce
       /* Jointure pour récupérer le propriétaire de l'annonce */
       LEFT JOIN utilisateurs prop ON prop.id_utilisateur = a.id_utilisateur
       LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
       LEFT JOIN villes v ON v.id_ville = a.id_ville
       LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
       WHERE m.id_expediteur = ? OR m.id_destinataire = ?
       GROUP BY m.id_message, interlocuteur_id
       ORDER BY m.date_envoi DESC`,
      [
        req.user.id, // Pour est_dernier_message_mien
        req.user.id, // Pour non_lus
        req.user.id, // Pour non_lus
        req.user.id, // Pour interlocuteur_nom
        req.user.id, // Pour interlocuteur_prenom
        req.user.id, // Sous-requête sub_interlocuteur
        req.user.id, // Sous-requête WHERE
        req.user.id, // Sous-requête WHERE
        req.user.id, // Main WHERE
        req.user.id  // Main WHERE
      ]
    );

    res.json(rows.map((row) => {
      const pNom = [row.proprietaire_nom, row.proprietaire_prenom].filter(Boolean).join(' ').trim();
      const iNom = [row.interlocuteur_nom, row.interlocuteur_prenom].filter(Boolean).join(' ').trim();

      return {
        ...row,
        id_annonce: row.id_annonce || null,
        proprietaire_nom: pNom || iNom || 'Propriétaire',
        interlocuteur_nom: iNom || '',
        dernier_message: row.dernier_message || '',
        date_dernier_message: row.date_dernier_message,
        est_dernier_message_mien: Boolean(row.est_dernier_message_mien),
        annonce_titre: row.annonce_titre || null,
        annonce_quartier: row.annonce_quartier || null,
        annonce_ville: row.annonce_ville || null,
        annonce_photo: row.annonce_photo || null,
      };
    }));
  } catch (err) {
    next(err);
  }
}

async function getThread(req, res, next) {
  try {
    const otherId = req.params.userId;
    const rows = await query(
      `SELECT m.*, ex.nom AS expediteur_nom, ex.prenom AS expediteur_prenom,
              de.nom AS destinataire_nom, de.prenom AS destinataire_prenom,
              a.titre AS annonce_titre
       FROM messages m
       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces a ON a.id_annonce = m.id_annonce
       WHERE (m.id_expediteur = ? AND m.id_destinataire = ?) OR (m.id_expediteur = ? AND m.id_destinataire = ?)
       ORDER BY m.date_envoi ASC`,
      [req.user.id, otherId, otherId, req.user.id]
    );
    await query('UPDATE messages SET est_lu = 1 WHERE id_expediteur = ? AND id_destinataire = ?', [otherId, req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function send(req, res, next) {
  try {
    const { id_destinataire, id_annonce, sujet, contenu, message_parent } = req.body;
    if (!id_destinataire || !contenu) {
      return res.status(400).json({ message: 'Destinataire et contenu requis.' });
    }

    const id = await insertAndGetId(
      `INSERT INTO messages (id_expediteur, id_destinataire, id_annonce, sujet, contenu, message_parent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, id_destinataire, id_annonce || null, sujet || null, contenu, message_parent || null]
    );

    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'message', ?, ?, ?)`,
      [id_destinataire, sujet || 'Nouveau message', contenu.slice(0, 255), `/compte?tab=messages&user=${req.user.id}`]
    ).catch(() => {});

    const [message] = await query(
      `SELECT m.*, ex.nom AS expediteur_nom, ex.prenom AS expediteur_prenom,
              de.nom AS destinataire_nom, de.prenom AS destinataire_prenom,
              de.email AS destinataire_email,
              a.titre AS annonce_titre
       FROM messages m
       JOIN utilisateurs ex ON ex.id_utilisateur = m.id_expediteur
       JOIN utilisateurs de ON de.id_utilisateur = m.id_destinataire
       LEFT JOIN annonces a ON a.id_annonce = m.id_annonce
       WHERE m.id_message = ? LIMIT 1`,
      [id]
    );

    req.app.get('realtime')?.sendDirectMessage?.(req.user.id, id_destinataire, message);

    res.status(201).json(message || { id_message: id });

    // Envoi de l'email en arrière-plan, sans bloquer la réponse HTTP
    envoyerEmailNouveauMessage(message).catch((err) =>
      console.error('[messages] erreur envoi email nouveau message:', err)
    );
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const { raison, description } = req.body;
    const rows = await query('SELECT * FROM messages WHERE id_message = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Message introuvable.' });
    const message = rows[0];
    const target = message.id_expediteur === req.user.id ? message.id_destinataire : message.id_expediteur;
    const id = await insertAndGetId(
      `INSERT INTO signalements (id_utilisateur_signalant, id_utilisateur_cible, id_annonce, id_message, raison, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, target, message.id_annonce || null, message.id_message, raison || 'Signalement conversation', description || null]
    );
    await query('UPDATE messages SET signalement_abus = 1 WHERE id_message = ?', [req.params.id]);
    res.status(201).json({ id_signalement: id });
  } catch (err) {
    next(err);
  }
}

async function removeThread(req, res, next) {
  try {
    const otherId = req.params.userId;
    await query(
      `DELETE FROM messages WHERE (id_expediteur = ? AND id_destinataire = ?) OR (id_expediteur = ? AND id_destinataire = ?)`,
      [req.user.id, otherId, otherId, req.user.id]
    );
    res.json({ message: 'Conversation supprimee.' });
  } catch (err) {
    next(err);
  }
}

async function removeMessage(req, res, next) {
  try {
    // allow sender or recipient to delete their copy
    const rows = await query('SELECT * FROM messages WHERE id_message = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Message introuvable.' });
    const msg = rows[0];
    if (msg.id_expediteur !== req.user.id && msg.id_destinataire !== req.user.id) {
      return res.status(403).json({ message: 'Acces refuse.' });
    }
    await query('DELETE FROM messages WHERE id_message = ?', [req.params.id]);
    res.json({ message: 'Message supprime.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listThreads, getThread, send, report, removeMessage, removeThread };