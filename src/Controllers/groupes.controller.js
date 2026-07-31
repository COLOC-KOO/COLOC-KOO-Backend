const { query, insertAndGetId } = require('../Services/db.service');

async function listGroups(req, res, next) {
  try {
    const rows = await query(
      `SELECT
              g.id_groupe,
              g.nom,
              g.id_createur,
              g.id_annonce,
              g.date_creation,
              gm.role,
              last_msg.date_envoi AS date_dernier_message,
              last_msg.contenu AS dernier_message,
              (SELECT COUNT(*) FROM groupe_messages total_msg WHERE total_msg.id_groupe = g.id_groupe) AS total_messages,
              (SELECT COUNT(*)
                 FROM groupe_messages unread_msg
                 LEFT JOIN groupe_lectures gl
                   ON gl.id_groupe = unread_msg.id_groupe AND gl.id_utilisateur = ?
                WHERE unread_msg.id_groupe = g.id_groupe
                  AND unread_msg.id_expediteur <> ?
                  AND (gl.dernier_message_lu IS NULL OR unread_msg.id_message > gl.dernier_message_lu)
              ) AS non_lus
       FROM groupes_discussion g
       JOIN groupe_membres gm ON gm.id_groupe = g.id_groupe AND gm.id_utilisateur = ?
       LEFT JOIN groupe_messages last_msg
         ON last_msg.id_message = (
           SELECT latest.id_message
           FROM groupe_messages latest
           WHERE latest.id_groupe = g.id_groupe
           ORDER BY latest.date_envoi DESC, latest.id_message DESC
           LIMIT 1
         )
       ORDER BY COALESCE(last_msg.date_envoi, g.date_creation) DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(rows.map((row) => ({
      ...row,
      total_messages: Number(row.total_messages || 0),
      non_lus: Number(row.non_lus || 0),
      membres: [],
    })));
  } catch (err) {
    next(err);
  }
}

async function removeGroup(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    const [member] = await query(
      'SELECT role FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur = ? LIMIT 1',
      [groupId, req.user.id]
    );
    if (!member) return res.status(403).json({ message: 'Acces refuse.' });

    const [group] = await query('SELECT id_createur FROM groupes_discussion WHERE id_groupe = ? LIMIT 1', [groupId]);
    const canDeleteForEveryone = Number(group?.id_createur) === Number(req.user.id) || member.role === 'admin';
    const realtime = req.app.get('realtime');

    if (canDeleteForEveryone) {
      const recipients = await query('SELECT id_utilisateur FROM groupe_membres WHERE id_groupe = ?', [groupId]);
      await query('DELETE FROM groupes_discussion WHERE id_groupe = ?', [groupId]);
      recipients.forEach((recipient) => {
        realtime?.sendToUser?.(recipient.id_utilisateur, { type: 'group_deleted', groupId });
      });
      return res.json({ message: 'Groupe supprime.' });
    }

    await query('DELETE FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur = ?', [groupId, req.user.id]);
    realtime?.sendToUser?.(req.user.id, { type: 'group_deleted', groupId });
    res.json({ message: 'Conversation retiree.' });
  } catch (err) {
    next(err);
  }
}

async function createGroup(req, res, next) {
  try {
    const nom = String(req.body.nom || '').trim();
    const memberIds = Array.isArray(req.body.membres) ? req.body.membres.map(Number).filter(Boolean) : [];
    const uniqueMemberIds = [...new Set(memberIds.filter((id) => id !== Number(req.user.id)))];

    if (!nom) return res.status(400).json({ message: 'Nom du groupe requis.' });
    if (uniqueMemberIds.length === 0) return res.status(400).json({ message: 'Selectionnez au moins un membre.' });

    const groupId = await insertAndGetId(
      'INSERT INTO groupes_discussion (nom, id_createur, id_annonce) VALUES (?, ?, ?)',
      [nom, req.user.id, req.body.id_annonce || null]
    );

    await query(
      'INSERT INTO groupe_membres (id_groupe, id_utilisateur, role) VALUES (?, ?, ?)',
      [groupId, req.user.id, 'admin']
    );

    const realtime = req.app.get('realtime');
    const groupConversation = {
      key: `group:${groupId}`,
      type: 'group',
      id: groupId,
      name: nom,
      initials: 'GR',
      lastMessage: 'Aucun message',
      total: 0,
      unread: 0,
      date: new Date().toISOString(),
    };

    for (const id of uniqueMemberIds) {
      await query(
        'INSERT IGNORE INTO groupe_membres (id_groupe, id_utilisateur, role) VALUES (?, ?, ?)',
        [groupId, id, 'membre']
      );
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'message', ?, ?, ?)`,
        [id, 'Ajout dans un groupe', `Vous avez ete ajoute au groupe "${nom}".`, `/compte?tab=messages&group=${groupId}`]
      ).catch(() => {});
      realtime?.sendToUser?.(id, {
        type: 'group_created',
        groupId,
        conversation: groupConversation,
        notification: {
          type_notification: 'message',
          titre: 'Ajout dans un groupe',
          texte: `Vous avez ete ajoute au groupe "${nom}".`,
          lien: `/compte?tab=messages&group=${groupId}`,
        },
      });
    }
    realtime?.sendToUser?.(req.user.id, {
      type: 'group_created',
      groupId,
      conversation: groupConversation,
    });

    res.status(201).json({ id_groupe: groupId, nom });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    const member = await query(
      'SELECT 1 FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur = ? LIMIT 1',
      [groupId, req.user.id]
    );
    if (!member.length) return res.status(403).json({ message: 'Acces refuse.' });

    const rows = await query(
      `SELECT gm.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom
       FROM groupe_messages gm
       JOIN utilisateurs u ON u.id_utilisateur = gm.id_expediteur
       WHERE gm.id_groupe = ?
       ORDER BY gm.date_envoi ASC`,
      [groupId]
    );

    const last = rows[rows.length - 1];
    await query(
      `INSERT INTO groupe_lectures (id_groupe, id_utilisateur, dernier_message_lu, date_derniere_lecture)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE dernier_message_lu = VALUES(dernier_message_lu), date_derniere_lecture = NOW()`,
      [groupId, req.user.id, last?.id_message || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    const contenu = String(req.body.contenu || '').trim();
    if (!contenu) return res.status(400).json({ message: 'Contenu requis.' });

    const member = await query(
      'SELECT 1 FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur = ? LIMIT 1',
      [groupId, req.user.id]
    );
    if (!member.length) return res.status(403).json({ message: 'Acces refuse.' });

    const id = await insertAndGetId(
      'INSERT INTO groupe_messages (id_groupe, id_expediteur, contenu) VALUES (?, ?, ?)',
      [groupId, req.user.id, contenu]
    );

    const [message] = await query(
      `SELECT gm.*, u.nom AS expediteur_nom, u.prenom AS expediteur_prenom
       FROM groupe_messages gm
       JOIN utilisateurs u ON u.id_utilisateur = gm.id_expediteur
       WHERE gm.id_message = ? LIMIT 1`,
      [id]
    );

    const recipients = await query(
      'SELECT id_utilisateur FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur <> ?',
      [groupId, req.user.id]
    );
    const [group] = await query('SELECT nom FROM groupes_discussion WHERE id_groupe = ? LIMIT 1', [groupId]);
    for (const recipient of recipients) {
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'message', ?, ?, ?)`,
        [recipient.id_utilisateur, group?.nom || 'Nouveau message de groupe', contenu.slice(0, 255), `/compte?tab=messages&group=${groupId}`]
      ).catch(() => {});
    }

    const realtime = req.app.get('realtime');
    realtime?.broadcastGroupMessage?.(groupId, req.user.id, message);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function reportMessage(req, res, next) {
  try {
    const groupId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    const { raison, description } = req.body || {};

    const [member] = await query(
      'SELECT 1 FROM groupe_membres WHERE id_groupe = ? AND id_utilisateur = ? LIMIT 1',
      [groupId, req.user.id]
    );
    if (!member) return res.status(403).json({ message: 'Acces refuse.' });

    const [message] = await query(
      `SELECT gm.*, g.id_annonce
       FROM groupe_messages gm
       JOIN groupes_discussion g ON g.id_groupe = gm.id_groupe
       WHERE gm.id_groupe = ? AND gm.id_message = ?
       LIMIT 1`,
      [groupId, messageId]
    );
    if (!message) return res.status(404).json({ message: 'Message introuvable.' });
    if (Number(message.id_expediteur) === Number(req.user.id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas signaler votre propre message.' });
    }

    const fullDescription = [
      description || null,
      `Signalement d'un message de groupe. id_groupe=${groupId}, id_message_groupe=${messageId}`,
      `Contenu: ${String(message.contenu || '').slice(0, 500)}`,
    ].filter(Boolean).join('\n');

    const id = await insertAndGetId(
      `INSERT INTO signalements (id_utilisateur_signalant, id_utilisateur_cible, id_annonce, id_message, raison, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, message.id_expediteur, message.id_annonce || null, null, raison || 'Signalement message de groupe', fullDescription]
    );
    await query('UPDATE groupe_messages SET signalement_abus = 1 WHERE id_message = ?', [messageId]);
    res.status(201).json({ id_signalement: id });
  } catch (err) {
    next(err);
  }
}

module.exports = { listGroups, createGroup, getMessages, sendMessage, removeGroup, reportMessage };
