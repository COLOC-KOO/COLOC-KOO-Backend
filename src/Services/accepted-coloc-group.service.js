const { insertAndGetId, query } = require('./db.service');

/**
 * Crée (ou met à jour) le groupe privé lié à une annonce lorsque le
 * propriétaire accepte une candidature. Le groupe contient toujours le
 * propriétaire et l'ensemble des candidats déjà acceptés.
 *
 * La fonction est idempotente : cliquer plusieurs fois sur « Accepter » ne
 * crée pas de doublon et ne duplique pas les membres.
 */
async function ensureAcceptedColocDiscussionGroup({ annonceId, ownerId, annonceTitre }) {
  const acceptedCandidates = await query(
    `SELECT DISTINCT id_utilisateur
     FROM candidatures
     WHERE id_annonce = ? AND statut IN ('signature', 'acceptee')`,
    [annonceId]
  );

  const groupName = `Colocation — ${annonceTitre || `annonce ${annonceId}`}`.slice(0, 255);
  const existingGroups = await query(
    `SELECT id_groupe
     FROM groupes_discussion
     WHERE id_annonce = ? AND id_createur = ? AND nom = ?
     LIMIT 1`,
    [annonceId, ownerId, groupName]
  );

  const groupId = existingGroups[0]?.id_groupe || await insertAndGetId(
    'INSERT INTO groupes_discussion (nom, id_createur, id_annonce) VALUES (?, ?, ?)',
    [groupName, ownerId, annonceId]
  );

  await query(
    'INSERT IGNORE INTO groupe_membres (id_groupe, id_utilisateur, role) VALUES (?, ?, ?)',
    [groupId, ownerId, 'admin']
  );

  for (const candidate of acceptedCandidates) {
    const userId = Number(candidate.id_utilisateur);
    if (!Number.isInteger(userId) || userId === Number(ownerId)) continue;

    await query(
      'INSERT IGNORE INTO groupe_membres (id_groupe, id_utilisateur, role) VALUES (?, ?, ?)',
      [groupId, userId, 'membre']
    );
  }

  return { id_groupe: groupId, nom: groupName };
}

async function getGroupMemberIds(groupId) {
  const rows = await query(
    'SELECT id_utilisateur FROM groupe_membres WHERE id_groupe = ?',
    [groupId]
  );
  return rows.map((row) => Number(row.id_utilisateur)).filter(Number.isInteger);
}

async function insertAutomaticMessage(groupId, contenu) {
  const id = await insertAndGetId(
    `INSERT INTO groupe_messages (id_groupe, id_expediteur, contenu, est_automatique)
     VALUES (?, NULL, ?, 1)`,
    [groupId, contenu]
  );
  return {
    id_message: id,
    id_groupe: Number(groupId),
    id_expediteur: null,
    expediteur_nom: 'Coloc\'KOO',
    expediteur_prenom: 'Message automatique',
    contenu,
    est_automatique: 1,
    date_envoi: new Date().toISOString(),
  };
}

/** Envoie la célébration à tous les membres après une validation effective. */
async function notifyAcceptedColocGroup({ group, realtime }) {
  const content = 'Toutes nos félicitations ! Votre candidature est validée. Vous pouvez maintenant vous organiser ensemble dans cette discussion.';
  const members = await getGroupMemberIds(group.id_groupe);
  const message = await insertAutomaticMessage(group.id_groupe, content);

  for (const userId of members) {
    await query(
      `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
       VALUES (?, 'systeme', ?, ?, ?)`,
      [userId, 'Toutes nos félicitations !', 'Votre candidature est validée.', `/compte?tab=messages&group=${group.id_groupe}`]
    );
    realtime?.sendToUser?.(userId, {
      type: 'colocation_validated',
      groupId: group.id_groupe,
      title: 'Toutes nos félicitations !',
      message: 'Votre candidature est validée.',
    });
    realtime?.sendToUser?.(userId, { type: 'group_message', groupId: group.id_groupe, message });
  }

  return { members, message };
}

/** Clôture les groupes de la candidature refusée et prévient leurs membres. */
async function closeRejectedCandidateGroups({ annonceId, candidateId, realtime }) {
  const groups = await query(
    `SELECT DISTINCT g.id_groupe, g.nom
     FROM groupes_discussion g
     JOIN groupe_membres gm ON gm.id_groupe = g.id_groupe
     WHERE g.id_annonce = ? AND gm.id_utilisateur = ? AND g.est_cloture = 0`,
    [annonceId, candidateId]
  );
  const content = 'Cette annonce n’est plus disponible pour votre groupe. La discussion est désormais clôturée.';

  for (const group of groups) {
    await query('UPDATE groupes_discussion SET est_cloture = 1 WHERE id_groupe = ?', [group.id_groupe]);
    const message = await insertAutomaticMessage(group.id_groupe, content);
    const members = await getGroupMemberIds(group.id_groupe);

    for (const userId of members) {
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'systeme', ?, ?, ?)`,
        [userId, 'Annonce non disponible', content, `/compte?tab=messages&group=${group.id_groupe}`]
      );
      realtime?.sendToUser?.(userId, { type: 'group_message', groupId: group.id_groupe, message });
      realtime?.sendToUser?.(userId, { type: 'group_closed', groupId: group.id_groupe, reason: 'annonce_non_disponible' });
    }
  }

  return groups;
}

module.exports = {
  ensureAcceptedColocDiscussionGroup,
  notifyAcceptedColocGroup,
  closeRejectedCandidateGroups,
};
