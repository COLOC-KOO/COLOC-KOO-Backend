const { query, insertAndGetId } = require('../Services/db.service');

const PROGRESS_STEPS = [
  { key: 'envoyee', label: 'Envoyee' },
  { key: 'recu', label: 'Recu' },
  { key: 'dossier', label: 'Dossier' },
  { key: 'signature', label: 'Signature' },
  { key: 'convention', label: 'Convention' },
];

const STATUS_ALIASES = {
  en_attente: 'envoyee',
  acceptee: 'signature',
  constituee: 'convention',
  refusee: 'refusee',
};

function normalizeStatus(statut) {
  return STATUS_ALIASES[statut] || statut || 'envoyee';
}

function mapCandidature(row, membres = []) {
  const normalized = normalizeStatus(row.statut);
  const currentIndex = PROGRESS_STEPS.findIndex(step => step.key === normalized);
  return {
    ...row,
    statut: normalized,
    statut_original: row.statut,
    progression: PROGRESS_STEPS.map((step, index) => ({
      ...step,
      done: currentIndex >= index,
      current: currentIndex === index,
    })),
    progressionIndex: Math.max(currentIndex, 0),
    membres,
  };
}

async function getAnnonceOwner(annonceId) {
  const rows = await query('SELECT id_utilisateur, titre FROM annonces WHERE id_annonce = ? LIMIT 1', [annonceId]);
  return rows[0] || null;
}

function canManageCandidature(reqUser, ownerId) {
  const userId = Number(reqUser?.id ?? reqUser?.id_utilisateur ?? reqUser?.userId ?? reqUser?.sub);
  const ownerUserId = Number(ownerId);

  if (Number.isInteger(userId) && Number.isInteger(ownerUserId) && userId === ownerUserId) {
    return true;
  }

  const role = String(reqUser?.role || reqUser?.poste || '').toLowerCase();
  return ['super_admin', 'admin', 'moderator'].includes(role);
}

async function ensureEquipeForAnnonce(annonceId, annonceTitre) {
  const existing = await query('SELECT id_equipe FROM equipes WHERE id_annonce = ? LIMIT 1', [annonceId]);
  if (existing.length) return existing[0].id_equipe;

  const equipeNom = `Equipe ${annonceTitre || `Annonce ${annonceId}`}`.slice(0, 255);
  return insertAndGetId('INSERT INTO equipes (id_annonce, nom, statut) VALUES (?, ?, ?)', [annonceId, equipeNom, 'forming']);
}

async function listMine(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT c.id_candidature, c.id_utilisateur, c.id_annonce, c.message, c.statut, c.date_creation, c.date_modification,
             a.titre, a.quartier, a.id_annonce AS annonce_id, ch.prix_loyer
      FROM candidatures c
      LEFT JOIN annonces a ON a.id_annonce = c.id_annonce
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      WHERE c.id_utilisateur = ?
      ORDER BY c.date_creation DESC
      `,
      [req.user.id]
    );

    const ids = rows.map(row => row.id_candidature);
    const membresRows = ids.length ? await query(
      `SELECT * FROM candidature_membres WHERE id_candidature IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids
    ) : [];
    res.json(rows.map(row => mapCandidature(row, membresRows.filter(m => m.id_candidature === row.id_candidature))));
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const rows = await query(
      `
      SELECT c.id_candidature, c.id_utilisateur, c.id_annonce, c.message, c.statut, c.date_creation, c.date_modification,
             a.titre, a.quartier, a.id_annonce AS annonce_id, ch.prix_loyer
      FROM candidatures c
      LEFT JOIN annonces a ON a.id_annonce = c.id_annonce
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      ORDER BY c.date_creation DESC
      LIMIT 500
      `
    );

    const ids = rows.map(row => row.id_candidature);
    const membresRows = ids.length ? await query(
      `SELECT * FROM candidature_membres WHERE id_candidature IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids
    ) : [];
    res.json(rows.map(row => mapCandidature(row, membresRows.filter(m => m.id_candidature === row.id_candidature))));
  } catch (err) {
    next(err);
  }
}

// async function create(req, res, next) {
//   try {
//     const { id_annonce, message, statut = 'envoyee', membres = [] } = req.body;
//     if (!id_annonce) {
//       return res.status(400).json({ message: 'Annonce requise.' });
//     }

//     const id = await insertAndGetId(
//       `INSERT INTO candidatures (id_utilisateur, id_annonce, message, statut) VALUES (?, ?, ?, ?)`,
//       [req.user.id, id_annonce, message || null, normalizeStatus(statut)]
//     );

//     for (const membre of membres) {
//       if (!membre?.nom) continue;
//       await query(
//         'INSERT INTO candidature_membres (id_candidature, nom, initiales, statut, profession, age) VALUES (?, ?, ?, ?, ?, ?)',
//         [id, membre.nom, membre.initiales || null, membre.statut || 'en_attente', membre.profession || null, membre.age || null]
//       );
//     }

//     const created = await query('SELECT * FROM candidatures WHERE id_candidature = ? LIMIT 1', [id]);
//     res.status(201).json(mapCandidature(created[0]));
//   } catch (err) {
//     next(err);
//   }
// }

async function create(req, res, next) {
  try {
    console.log("📥 ===== CREATE CANDIDATURE =====");
    console.log("📥 req.user:", req.user);
    console.log("📥 req.user.id:", req.user?.id);
    console.log("📥 req.body:", req.body);

    const { id_annonce, message, statut = 'envoyee', membres = [] } = req.body;
    
    if (!id_annonce) {
      console.log("❌ id_annonce manquant");
      return res.status(400).json({ message: 'Annonce requise.' });
    }

    // Vérifier que req.user.id existe
    if (!req.user || !req.user.id) {
      console.log("❌ Utilisateur non authentifié ou ID manquant");
      return res.status(401).json({ message: 'Utilisateur non authentifié.' });
    }

    const annonce = await getAnnonceOwner(id_annonce);
    if (!annonce) {
      console.log("❌ Annonce introuvable");
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    const existing = await query(
      `SELECT COUNT(*) as count 
       FROM candidatures 
       WHERE id_utilisateur = ? AND id_annonce = ?`,
      [req.user.id, id_annonce]
    );

    console.log(`📊 Candidatures existantes: ${existing[0].count}`);

    if (existing[0].count > 0) {
      console.log("⚠️ DOUBLON DÉTECTÉ");
      return res.status(400).json({ 
        message: 'Vous avez déjà postulé à cette annonce.'
      });
    }

    const id = await insertAndGetId(
      `INSERT INTO candidatures (id_utilisateur, id_annonce, message, statut) VALUES (?, ?, ?, ?)`,
      [req.user.id, id_annonce, message || null, normalizeStatus(statut)]
    );

    console.log(`✅ Candidature créée avec ID: ${id}`);

    // Créer une notification pour le propriétaire de l'annonce
    try {
      const notifTitle = 'Nouvelle candidature sur votre annonce';
      const notifText = `Un colocataire a postulé à votre annonce « ${annonce.titre || 'votre annonce'} ».`;
      const notifLink = `/annonces/${id_annonce}`;
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'candidature', ?, ?, ?)`,
        [annonce.id_utilisateur, notifTitle, notifText, notifLink]
      );
    } catch (notifError) {
      console.error('❌ Erreur notification propriétaire:', notifError);
    }

    const created = await query('SELECT * FROM candidatures WHERE id_candidature = ? LIMIT 1', [id]);
    res.status(201).json(mapCandidature(created[0]));
  } catch (err) {
    console.error("❌ ERREUR:", err);
    next(err);
  }
}

async function updateMine(req, res, next) {
  try {
    const { message, statut } = req.body;
    const sets = [];
    const values = [];
    if (message !== undefined) {
      sets.push('message = ?');
      values.push(message);
    }
    if (statut !== undefined) {
      sets.push('statut = ?');
      values.push(normalizeStatus(statut));
    }
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }
    values.push(req.params.id, req.user.id);
    await query(`UPDATE candidatures SET ${sets.join(', ')} WHERE id_candidature = ? AND id_utilisateur = ?`, values);
    res.json({ message: 'Candidature mise a jour.' });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { statut } = req.body;
    await query('UPDATE candidatures SET statut = ? WHERE id_candidature = ?', [normalizeStatus(statut), req.params.id]);
    res.json({ message: 'Statut mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const candidatureId = Number(req.params.id);
    if (!Number.isInteger(candidatureId)) {
      return res.status(400).json({ message: 'Candidature invalide.' });
    }

    const candidatureRows = await query(
      `SELECT c.id_candidature, c.id_annonce, c.id_utilisateur, a.id_utilisateur AS owner_id
       FROM candidatures c
       LEFT JOIN annonces a ON a.id_annonce = c.id_annonce
       WHERE c.id_candidature = ? LIMIT 1`,
      [candidatureId]
    );

    if (!candidatureRows.length) {
      return res.status(404).json({ message: 'Candidature introuvable.' });
    }

    const candidature = candidatureRows[0];
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const canDelete = currentUserId === Number(candidature.owner_id)
      || currentUserId === Number(candidature.id_utilisateur)
      || ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    if (!canDelete) {
      return res.status(403).json({ message: 'Vous ne pouvez pas supprimer cette candidature.' });
    }

    await query('DELETE FROM candidature_membres WHERE id_candidature = ?', [candidatureId]);
    await query('DELETE FROM candidatures WHERE id_candidature = ?', [candidatureId]);

    res.json({ message: 'Candidature supprimée.' });
  } catch (err) {
    next(err);
  }
}

async function decide(req, res, next) {
  try {
    const candidatureId = Number(req.params.id);
    const { action, message } = req.body;
    if (!Number.isInteger(candidatureId)) {
      return res.status(400).json({ message: 'Candidature invalide.' });
    }
    if (!['accept', 'refuse', 'discuss'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide.' });
    }

    const candidatureRows = await query(
      `SELECT c.id_candidature, c.id_annonce, c.id_utilisateur, c.statut, a.id_utilisateur AS owner_id, a.titre
       FROM candidatures c
       LEFT JOIN annonces a ON a.id_annonce = c.id_annonce
       WHERE c.id_candidature = ? LIMIT 1`,
      [candidatureId]
    );

    if (!candidatureRows.length) {
      return res.status(404).json({ message: 'Candidature introuvable.' });
    }

    const candidature = candidatureRows[0];
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    if (!Number.isInteger(currentUserId)) {
      return res.status(401).json({ message: 'Utilisateur non authentifie.' });
    }

    const isOwner = currentUserId === Number(candidature.owner_id);
    const isCandidate = currentUserId === Number(candidature.id_utilisateur);

    if (action === 'discuss') {
      const destinataireId = isCandidate ? Number(candidature.owner_id) : Number(candidature.id_utilisateur);
      const contenu = message || `Bonjour, je souhaite discuter de votre candidature pour l'annonce ${candidature.titre || candidature.id_annonce}.`;
      const conversationId = await insertAndGetId(
        `INSERT INTO messages (id_expediteur, id_destinataire, id_annonce, sujet, contenu)
         VALUES (?, ?, ?, ?, ?)`,
        [currentUserId, destinataireId, candidature.id_annonce, 'Discussion candidature', contenu]
      );
      await query(
        `INSERT INTO notifications (id_utilisateur, type_notification, titre, texte, lien)
         VALUES (?, 'message', ?, ?, ?)`,
        [destinataireId, 'Nouvelle discussion', contenu.slice(0, 255), `/messages/${currentUserId}`]
      ).catch(() => {});
      return res.json({ message: 'Discussion lancée.', conversationId });
    }

    if (!canManageCandidature(req.user, candidature.owner_id)) {
      return res.status(403).json({ message: 'Vous ne pouvez pas gérer cette candidature.' });
    }

    const equipeId = await ensureEquipeForAnnonce(candidature.id_annonce, candidature.titre);

    if (action === 'accept') {
      await query('UPDATE candidatures SET statut = ? WHERE id_candidature = ?', [normalizeStatus('acceptee'), candidatureId]);
      await query('UPDATE equipes SET statut = ? WHERE id_equipe = ?', ['selected', equipeId]);
      await query(
        `INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut)
         VALUES (?, ?, 'accepted')`,
        [equipeId, candidature.id_utilisateur]
      );
      return res.json({ message: 'Candidature acceptée.', equipeId });
    }

    if (action === 'refuse') {
      await query('UPDATE candidatures SET statut = ? WHERE id_candidature = ?', [normalizeStatus('refusee'), candidatureId]);
      await query('UPDATE equipes SET statut = ? WHERE id_equipe = ?', ['rejected', equipeId]);
      await query(
        `INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut)
         VALUES (?, ?, 'refused')`,
        [equipeId, candidature.id_utilisateur]
      );
      return res.json({ message: 'Candidature refusée.', equipeId });
    }
  } catch (err) {
    next(err);
  }
}

async function launchColocation(req, res, next) {
  try {
    const annonceId = Number(req.params.id);
    const rows = await query(
      `SELECT a.id_annonce, a.id_utilisateur, a.titre, a.total_colocataires
       FROM annonces a
       WHERE a.id_annonce = ? LIMIT 1`,
      [annonceId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    const annonce = rows[0];
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const canLaunch = currentUserId === Number(annonce.id_utilisateur)
      || ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    if (!canLaunch) {
      return res.status(403).json({ message: 'Vous ne pouvez pas lancer cette colocation.' });
    }

    const acceptedStatuses = [...new Set(['acceptee', normalizeStatus('acceptee')])];
    const accepted = await query(
      `SELECT c.id_candidature, c.id_utilisateur, c.id_annonce, u.nom, u.prenom, u.email
       FROM candidatures c
       LEFT JOIN utilisateurs u ON u.id_utilisateur = c.id_utilisateur
       WHERE c.id_annonce = ? AND c.statut IN (${acceptedStatuses.map(() => '?').join(', ')})
       ORDER BY c.date_creation ASC`,
      [annonceId, ...acceptedStatuses]
    );

    const requiredCount = Number(annonce.total_colocataires) || 3;
    if (accepted.length < requiredCount) {
      return res.status(400).json({ message: `Au moins ${requiredCount} candidats acceptés sont requis.` });
    }

    const equipeId = await ensureEquipeForAnnonce(annonceId, annonce.titre);
    await query('UPDATE equipes SET statut = ? WHERE id_equipe = ?', ['complete', equipeId]);

    for (const candidature of accepted) {
      const existingMemberRows = await query(
        'SELECT id FROM candidature_membres WHERE id_candidature = ? LIMIT 1',
        [candidature.id_candidature]
      );
      const memberName = [candidature.prenom, candidature.nom].filter(Boolean).join(' ').trim() || `Membre ${candidature.id_utilisateur}`;
      const initiales = [candidature.prenom, candidature.nom].filter(Boolean).map((value) => String(value).charAt(0)).join('').slice(0, 2).toUpperCase() || 'MB';

      if (existingMemberRows.length) {
        await query(
          `UPDATE candidature_membres
           SET nom = ?, initiales = ?, statut = ?, profession = ?, age = ?
           WHERE id_candidature = ?`,
          [memberName, initiales, 'accepte', null, null, candidature.id_candidature]
        );
      } else {
        await query(
          `INSERT INTO candidature_membres (id_candidature, nom, initiales, statut, profession, age)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [candidature.id_candidature, memberName, initiales, 'accepte', null, null]
        );
      }
    }

    await query('DELETE FROM membres_equipes WHERE id_equipe = ?', [equipeId]);
    for (const candidature of accepted) {
      await query(
        `INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut)
         VALUES (?, ?, ?)`,
        [equipeId, candidature.id_utilisateur, 'accepted']
      );
    }

    return res.json({ message: 'Colocation lancée.', equipeId, membres: accepted });
  } catch (err) {
    next(err);
  }
}

// Bareme de prix par defaut (aligne sur la maquette candidatures v4_17_3).
// Surchargeable par le super-admin via configuration_backoffice (cles CONTRACT_TIERS / EDL_PRIX).
const DEFAULT_CONTRACT_TIERS = [
  { maxLoyer: 450000, prix: 27000 },
  { maxLoyer: 1350000, prix: 47000 },
  { maxLoyer: null, prix: 60000 },
];
const DEFAULT_EDL_PRIX = 10000;

async function getConfigValue(cle, fallback) {
  try {
    const rows = await query('SELECT valeur FROM configuration_backoffice WHERE cle = ? LIMIT 1', [cle]);
    if (!rows.length || rows[0].valeur == null) return fallback;
    const raw = rows[0].valeur;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

async function resolveContractPricing() {
  const tiers = await getConfigValue('CONTRACT_TIERS', DEFAULT_CONTRACT_TIERS);
  const edlPrix = Number(await getConfigValue('EDL_PRIX', DEFAULT_EDL_PRIX)) || DEFAULT_EDL_PRIX;
  const contratPrixFor = (loyerTotal) => {
    const list = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_CONTRACT_TIERS;
    for (const tier of list) {
      if (tier.maxLoyer == null || Number(loyerTotal) <= Number(tier.maxLoyer)) return Number(tier.prix) || 0;
    }
    return Number(list[list.length - 1].prix) || 0;
  };
  return { edlPrix, contratPrixFor };
}

async function createContracts(req, res, next) {
  try {
    const annonceId = Number(req.params.id);
    const { mode, type_bail = null, clause_solidarite = null } = req.body;
    if (!['contrat', 'edl', 'both'].includes(mode)) {
      return res.status(400).json({ message: 'Mode de contrat invalide.' });
    }
    const needsBail = mode === 'contrat' || mode === 'both';
    if (needsBail && !['individuel', 'collectif'].includes(type_bail)) {
      return res.status(400).json({ message: 'Type de bail requis (individuel ou collectif).' });
    }
    if (needsBail && clause_solidarite != null && !['avec', 'sans'].includes(clause_solidarite)) {
      return res.status(400).json({ message: 'Clause de solidarite invalide.' });
    }

    const rows = await query(
      `SELECT a.id_annonce, a.id_utilisateur, a.titre, a.total_colocataires
       FROM annonces a
       WHERE a.id_annonce = ? LIMIT 1`,
      [annonceId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    const annonce = rows[0];
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const canCreateContract = currentUserId === Number(annonce.id_utilisateur)
      || ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    if (!canCreateContract) {
      return res.status(403).json({ message: 'Vous ne pouvez pas créer ce contrat.' });
    }

    const accepted = await query(
      `SELECT c.id_candidature, c.id_utilisateur, u.nom, u.prenom, u.email
       FROM candidatures c
       LEFT JOIN utilisateurs u ON u.id_utilisateur = c.id_utilisateur
       WHERE c.id_annonce = ? AND c.statut = ?
       ORDER BY c.date_creation ASC`,
      [annonceId, normalizeStatus('acceptee')]
    );

    const requiredCount = Number(annonce.total_colocataires) || 3;
    if (accepted.length < requiredCount) {
      return res.status(400).json({ message: `Au moins ${requiredCount} candidats acceptés sont requis.` });
    }

    const ownerRows = await query(
      'SELECT id_utilisateur, nom, prenom, email, telephone FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1',
      [annonce.id_utilisateur]
    );

    const parties = [];
    if (ownerRows.length) {
      const owner = ownerRows[0];
      parties.push({
        id_utilisateur: owner.id_utilisateur,
        nom_complet: [owner.prenom, owner.nom].filter(Boolean).join(' ').trim() || `Propriétaire ${owner.id_utilisateur}`,
        role: 'proprietaire',
        cin: null,
        telephone: owner.telephone || null,
        email: owner.email || null,
        commentaire: 'Propriétaire du logement',
      });
    }

    for (const candidate of accepted) {
      parties.push({
        id_utilisateur: candidate.id_utilisateur,
        nom_complet: [candidate.prenom, candidate.nom].filter(Boolean).join(' ').trim() || `Locataire ${candidate.id_utilisateur}`,
        role: 'colocataire',
        cin: null,
        telephone: null,
        email: candidate.email || null,
        commentaire: 'Locataire accepté',
      });
    }

    // Loyer mensuel total de la colocation (somme des chambres) pour choisir la tranche de prix.
    const loyerRows = await query('SELECT COALESCE(SUM(prix_loyer), 0) AS total FROM chambres WHERE id_annonce = ?', [annonceId]);
    const loyerTotal = Number(loyerRows[0]?.total || 0);
    const { edlPrix, contratPrixFor } = await resolveContractPricing();
    const priceFor = (type) => (type === 'edl' ? edlPrix : contratPrixFor(loyerTotal));

    const levels = mode === 'both' ? ['contrat', 'edl'] : [mode];
    const ids = [];
    const createdContracts = [];

    for (const type of levels) {
      const reference = `CT-${Date.now().toString().slice(-8)}`;
      const montant = priceFor(type);
      const id_contrat = await insertAndGetId(
        'INSERT INTO contrats (reference, id_annonce, type, type_bail, clause_solidarite, statut, montant_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          reference,
          annonceId,
          type,
          type === 'contrat' ? type_bail : null,
          type === 'contrat' ? clause_solidarite : null,
          type === 'edl' ? 'a-planifier' : 'a-emettre',
          montant,
        ]
      );
      ids.push(Number(id_contrat));

      for (const partie of parties) {
        await query(
          `INSERT INTO parties_contrats (id_contrat, id_utilisateur, nom_complet, role, cin, telephone, email, commentaire)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id_contrat,
            partie.id_utilisateur || null,
            partie.nom_complet || null,
            partie.role,
            partie.cin || null,
            partie.telephone || null,
            partie.email || null,
            partie.commentaire || null,
          ]
        );
      }

      const createdContractRows = await query('SELECT * FROM contrats WHERE id_contrat = ? LIMIT 1', [id_contrat]);
      const createdPartiesRows = await query('SELECT * FROM parties_contrats WHERE id_contrat = ? ORDER BY role, id', [id_contrat]);
      const createdContract = {
        ...createdContractRows[0],
        parties: createdPartiesRows,
      };
      createdContracts.push(createdContract);
    }

    return res.json({ message: 'Contrat(s) créé(s).', contratIds: ids, contracts: createdContracts });
  } catch (err) {
    next(err);
  }
}

// Paiement Mobile Money manuel d'un contrat (maquette : l'usager saisit sa reference,
// le back-office qualifie ensuite). Aucune passerelle bancaire automatique.
const MOBILE_MONEY_MOYENS = ['MVOLA', 'Orange Money'];

async function submitContractPayment(req, res, next) {
  try {
    const contratId = Number(req.params.id);
    const { moyen_paiement, reference_operateur, montant } = req.body;

    if (!Number.isInteger(contratId) || contratId <= 0) {
      return res.status(400).json({ message: 'Contrat invalide.' });
    }
    if (!MOBILE_MONEY_MOYENS.includes(moyen_paiement)) {
      return res.status(400).json({ message: 'Moyen de paiement invalide (Orange Money ou MVOLA).' });
    }
    if (!reference_operateur || String(reference_operateur).trim().length < 4) {
      return res.status(400).json({ message: 'Référence de paiement Mobile Money requise.' });
    }

    const rows = await query(
      `SELECT c.id_contrat, c.montant_total, c.type, a.id_annonce, a.id_utilisateur
       FROM contrats c
       JOIN annonces a ON a.id_annonce = c.id_annonce
       WHERE c.id_contrat = ? LIMIT 1`,
      [contratId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Contrat introuvable.' });
    }
    const contrat = rows[0];

    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const canPay = currentUserId === Number(contrat.id_utilisateur)
      || ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);
    if (!canPay) {
      return res.status(403).json({ message: 'Vous ne pouvez pas régler ce contrat.' });
    }

    const montantDu = Number(montant) > 0 ? Number(montant) : Number(contrat.montant_total || 0);
    const reference = `PAY-${Date.now().toString().slice(-8)}`;
    const id_paiement = await insertAndGetId(
      `INSERT INTO paiements
        (reference, id_utilisateur, id_contrat, id_annonce, montant_du, montant_recu, moyen_paiement, service_type, statut, date_paiement, reference_operateur)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'contrat', 'a-verifier', CURDATE(), ?)`,
      [reference, currentUserId, contratId, contrat.id_annonce, montantDu, montantDu, moyen_paiement, String(reference_operateur).trim()]
    );

    return res.status(201).json({
      message: 'Paiement enregistré. Il sera vérifié par notre équipe.',
      id_paiement: Number(id_paiement),
      reference,
      statut: 'a-verifier',
    });
  } catch (err) {
    next(err);
  }
}

// Vérifier si un utilisateur a déjà postulé à une annonce spécifique
// async function checkUserApplied(req, res, next) {
//   try {
//     const { annonceId, userId } = req.query;
    
//     if (!annonceId || !userId) {
//       return res.status(400).json({ 
//         message: 'Les paramètres annonceId et userId sont requis.' 
//       });
//     }

//     const rows = await query(
//       `SELECT COUNT(*) as count 
//        FROM candidatures c
//        WHERE c.id_annonce = ? AND c.id_utilisateur = ?`,
//       [annonceId, userId]
//     );

//     res.json({ 
//       hasApplied: rows[0].count > 0,
//       count: rows[0].count
//     });
//   } catch (err) {
//     next(err);
//   }
// }

// Dans candidatures.controller.js
async function checkUserApplied(req, res, next) {
  try {
    const { annonceId, userId } = req.query;
    
    if (!annonceId || !userId) {
      return res.status(400).json({ 
        message: 'Les paramètres annonceId et userId sont requis.' 
      });
    }

    // Si l'utilisateur est authentifié, on vérifie si c'est le même
    if (req.user && req.user.id !== parseInt(userId)) {
      // Optionnel : vérifier si l'utilisateur a le droit de voir cette info
      // Pour l'instant, on laisse passer
    }

    const rows = await query(
      `SELECT COUNT(*) as count 
       FROM candidatures c
       WHERE c.id_annonce = ? AND c.id_utilisateur = ?`,
      [annonceId, userId]
    );

    res.json({ 
      hasApplied: rows[0].count > 0,
      count: rows[0].count
    });
  } catch (err) {
    next(err);
  }
}

// Récupérer toutes les candidatures pour une annonce spécifique
async function listByAnnonce(req, res, next) {
  try {
    const { id } = req.params;
    
    const rows = await query(
      `
      SELECT c.id_candidature, c.id_utilisateur, c.id_annonce, c.message, c.statut, c.date_creation, c.date_modification,
             u.id_utilisateur as utilisateur_id, u.nom, u.prenom, u.email, u.telephone, u.profession, u.age, u.bio,
             u.date_naissance, u.profile_picture, v_act.nom_ville AS ville_actuelle, v_orig.nom_ville AS ville_origine,
             a.titre, a.quartier, a.id_annonce AS annonce_id, ch.prix_loyer
      FROM candidatures c
      LEFT JOIN utilisateurs u ON u.id_utilisateur = c.id_utilisateur
      LEFT JOIN villes v_act ON v_act.id_ville = u.ville_actuelle
      LEFT JOIN villes v_orig ON v_orig.id_ville = u.ville_origine
      LEFT JOIN annonces a ON a.id_annonce = c.id_annonce
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      WHERE c.id_annonce = ?
      ORDER BY c.date_creation DESC
      `,
      [id]
    );

    const ids = rows.map(row => row.id_candidature);
    let membresRows = [];
    if (ids.length) {
      membresRows = await query(
        `SELECT * FROM candidature_membres 
         WHERE id_candidature IN (${ids.map(() => '?').join(',')}) 
         ORDER BY id`,
        ids
      );
    }

    // Mapper les résultats avec les membres
    const result = rows.map(row => {
      const membres = membresRows.filter(m => m.id_candidature === row.id_candidature);
      return {
        ...row,
        membres: membres.map(m => ({
          nom: m.nom,
          initiales: m.initiales,
          statut: m.statut,
          profession: m.profession,
          age: m.age
        }))
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { 
  listMine, 
  listAll, 
  listByAnnonce,  
  checkUserApplied,
  create, 
  updateMine, 
  updateStatus,
  remove,
  decide,
  launchColocation,
  createContracts,
  submitContractPayment,
};
