const { query, insertAndGetId } = require('../Services/db.service');
const { ensureContractContent } = require('./meta.controller');

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
    // La colonne JSON est deja parsee par mysql2. Si c'est une chaine, on tente
    // un parse (double encodage) mais on renvoie la chaine telle quelle si ce
    // n'est pas du JSON (ex : un gabarit HTML).
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
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
    const { mode } = req.body;
    if (!['contrat', 'edl', 'both'].includes(mode)) {
      return res.status(400).json({ message: 'Mode de contrat invalide.' });
    }

    const rows = await query(
      `SELECT a.id_annonce, a.id_utilisateur, a.titre, a.total_colocataires, a.type_bail, a.clause_solidarite
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

    // Le type de bail et la clause de solidarite sont HERITES de l'annonce (cahier des charges).
    // Defaut raisonnable si une ancienne annonce ne les a pas encore definis.
    const type_bail = ['individuel', 'collectif'].includes(annonce.type_bail) ? annonce.type_bail : 'collectif';
    const clause_solidarite = ['avec', 'sans'].includes(annonce.clause_solidarite) ? annonce.clause_solidarite : 'sans';

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

    // Prix = SOMME de toutes les offres actives du type dans services_ckoo (cle_service contrat_* / edl_*).
    const sumOffers = async (likePrefix) => {
      const r = await query("SELECT COALESCE(SUM(prix), 0) AS total FROM services_ckoo WHERE cle_service LIKE ? AND est_actif = 1", [likePrefix]);
      return Number(r[0]?.total || 0);
    };
    const contratMontant = await sumOffers('contrat%');
    const edlMontant = await sumOffers('edl%');
    const priceFor = (type) => (type === 'edl' ? edlMontant : contratMontant);

    const levels = mode === 'both' ? ['contrat', 'edl'] : [mode];
    const ids = [];
    const createdContracts = [];

    for (const type of levels) {
      const montant = priceFor(type);
      // Reutilise le contrat existant de ce type pour l'annonce (pas de doublon).
      const existingRows = await query(
        'SELECT id_contrat FROM contrats WHERE id_annonce = ? AND type = ? ORDER BY id_contrat LIMIT 1',
        [annonceId, type]
      );
      let id_contrat;
      if (existingRows.length) {
        id_contrat = Number(existingRows[0].id_contrat);
        await query(
          'UPDATE contrats SET type_bail = ?, clause_solidarite = ?, montant_total = ? WHERE id_contrat = ?',
          [type === 'contrat' ? type_bail : null, type === 'contrat' ? clause_solidarite : null, montant, id_contrat]
        );
        await query('DELETE FROM parties_contrats WHERE id_contrat = ?', [id_contrat]);
      } else {
        const reference = `CT-${Date.now().toString().slice(-8)}`;
        id_contrat = await insertAndGetId(
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
      }
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
      `SELECT c.id_contrat, c.montant_total, c.type, c.statut, a.id_annonce, a.id_utilisateur AS owner_id, a.total_colocataires
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
    const isStaff = ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    // L'honoraire de service Coloc'KOO est reparti entre les colocataires : chaque
    // colocataire regle SA PART, et ce paiement vaut acceptation du contrat.
    // On se base sur les parties du contrat (source fiable des colocataires concernes).
    const partyRows = await query(
      'SELECT id_utilisateur, role FROM parties_contrats WHERE id_contrat = ? AND id_utilisateur IS NOT NULL',
      [contratId]
    );
    const colocIds = partyRows
      .filter((p) => /coloc/i.test(p.role || ''))
      .map((p) => Number(p.id_utilisateur));
    const isColocataire = colocIds.includes(currentUserId);
    if (!isColocataire && currentUserId !== Number(contrat.owner_id) && !isStaff) {
      return res.status(403).json({ message: 'Seuls les colocataires du contrat peuvent régler leur part.' });
    }

    // Empeche le double paiement de la meme personne pour ce contrat.
    const already = await query(
      "SELECT id_paiement FROM paiements WHERE id_contrat = ? AND id_utilisateur = ? AND service_type = 'contrat' LIMIT 1",
      [contratId, currentUserId]
    );
    if (already.length) {
      return res.status(409).json({ message: 'Vous avez déjà réglé votre part de ce contrat.' });
    }

    // Part de chacun = forfait Coloc'KOO / nombre de colocataires.
    const nbColoc = Math.max(1, colocIds.length || Number(contrat.total_colocataires) || 1);
    const part = Math.ceil(Number(contrat.montant_total || 0) / nbColoc);

    const reference = `PAY-${Date.now().toString().slice(-8)}`;
    const id_paiement = await insertAndGetId(
      `INSERT INTO paiements
        (reference, id_utilisateur, id_contrat, id_annonce, montant_du, montant_recu, moyen_paiement, service_type, statut, date_paiement, reference_operateur)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'contrat', 'a-verifier', CURDATE(), ?)`,
      [reference, currentUserId, contratId, contrat.id_annonce, part, part, moyen_paiement, String(reference_operateur).trim()]
    );

    // Le contrat est valide quand TOUS les colocataires ont regle leur part.
    const paidRows = await query(
      "SELECT COUNT(DISTINCT id_utilisateur) AS n FROM paiements WHERE id_contrat = ? AND service_type = 'contrat'",
      [contratId]
    );
    const paidCount = Number(paidRows[0]?.n || 0);
    const allPaid = paidCount >= nbColoc;
    if (allPaid && contrat.statut !== 'emis') {
      await query("UPDATE contrats SET statut = 'emis', date_emission = COALESCE(date_emission, NOW()) WHERE id_contrat = ?", [contratId]);
    }

    return res.status(201).json({
      message: allPaid
        ? 'Paiement enregistré. Toutes les parts sont réglées : le contrat est validé.'
        : `Paiement enregistré (${paidCount}/${nbColoc} colocataires). Il sera vérifié par notre équipe.`,
      id_paiement: Number(id_paiement),
      reference,
      montant: part,
      statut: 'a-verifier',
      paidCount,
      total: nbColoc,
      allPaid,
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

// ===== Generation du vrai document de contrat (gabarit DB + donnees reelles) =====
function fmtNumber(n) {
  return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function frDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(value);
  }
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function generateContractDocument(req, res, next) {
  try {
    await ensureContractContent();
    const contratId = Number(req.params.id);
    if (!Number.isInteger(contratId) || contratId <= 0) {
      return res.status(400).json({ message: 'Contrat invalide.' });
    }

    const rows = await query(
      `SELECT c.*, a.id_utilisateur AS owner_id, a.titre, a.type_propriete, a.surface_totale,
              a.adresse_exacte, a.quartier, v.nom_ville,
              ch.prix_loyer, ch.prix_charges, ch.montant_garantie, ch.date_disponibilite
       FROM contrats c
       JOIN annonces a ON a.id_annonce = c.id_annonce
       JOIN villes v ON v.id_ville = a.id_ville
       LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
       WHERE c.id_contrat = ? LIMIT 1`,
      [contratId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Contrat introuvable.' });
    const c = rows[0];

    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const isStaff = ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    const parties = await query('SELECT id_utilisateur, nom_complet, role FROM parties_contrats WHERE id_contrat = ? ORDER BY role, id', [contratId]);
    // Le proprietaire, les colocataires (parties du contrat) et le staff peuvent lire le document.
    const isParty = parties.some((p) => Number(p.id_utilisateur) === currentUserId);
    const canView = currentUserId === Number(c.owner_id) || isStaff || isParty;
    if (!canView) return res.status(403).json({ message: 'Accès refusé à ce document.' });
    const clauseRows = await query('SELECT titre, description FROM contrat_clauses WHERE est_actif = 1 ORDER BY ordre, id_clause');

    const owner = parties.find((p) => /proprio|propriet/i.test(p.role || ''));
    const colocs = parties.filter((p) => !/proprio|propriet/i.test(p.role || ''));
    const adresse = [c.adresse_exacte, c.quartier, c.nom_ville].filter(Boolean).join(', ') || c.nom_ville || '—';
    const solidPhrase = c.clause_solidarite === 'sans'
      ? "Sans clause de solidarité : chaque colocataire n'est responsable que de sa propre part."
      : "Avec clause de solidarité : en cas de défaut de l'un des colocataires, les autres sont redevables de l'ensemble du loyer.";

    const clausesHtml = clauseRows.length
      ? '<ul>' + clauseRows.map((cl) => `<li><b>${escapeHtml(cl.titre)}</b> — ${escapeHtml(cl.description || '')}</li>`).join('') + '</ul>'
      : '';
    const signaturesHtml = parties
      .map((p) => `<div class="sig"><div class="who">${escapeHtml(p.nom_complet || 'Partie')} <span class="role">(${escapeHtml(p.role || '')})</span></div><div class="line">Signature : ______________________</div></div>`)
      .join('');

    const vars = {
      reference: escapeHtml(c.reference || `#${contratId}`),
      ville: escapeHtml(c.nom_ville || ''),
      today: frDate(new Date()),
      proprietaire: escapeHtml(owner?.nom_complet || '—'),
      colocataires: escapeHtml(colocs.map((p) => p.nom_complet).filter(Boolean).join(', ') || '—'),
      adresse: escapeHtml(adresse),
      type_bien: escapeHtml([c.type_propriete, c.surface_totale ? `${c.surface_totale} m²` : null].filter(Boolean).join(' · ')),
      date_entree: frDate(c.date_disponibilite),
      type_bail: escapeHtml(c.type_bail === 'collectif' ? 'Bail collectif' : c.type_bail === 'individuel' ? 'Bail individuel' : '—'),
      solidarite_phrase: escapeHtml(solidPhrase),
      loyer: fmtNumber(c.prix_loyer),
      charges: fmtNumber(c.prix_charges),
      caution: fmtNumber(c.montant_garantie || c.prix_loyer),
      clauses_list: clausesHtml, // deja du HTML
      signatures: signaturesHtml, // deja du HTML
    };

    const templateKey = c.type === 'edl' ? 'CONTRACT_EDL_TEMPLATE' : 'CONTRACT_DOCUMENT_TEMPLATE';
    let template = await getConfigValue(templateKey, '');
    if (!template || typeof template !== 'string') {
      template = c.type === 'edl' ? '<h1>État des lieux</h1>{signatures}' : '<h1>Contrat de colocation</h1>{clauses_list}{signatures}';
    }

    const bodyHtml = template.replace(/\{(\w+)\}/g, (m, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m
    );

    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${c.type === 'edl' ? 'État des lieux' : 'Contrat'} ${vars.reference}</title>
<style>
  @page { margin: 24mm; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; max-width: 800px; margin: 24px auto; padding: 0 24px; line-height: 1.55; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 4px; }
  .ref { text-align: center; color: #666; font-size: 12px; margin: 0 0 22px; }
  h2 { font-size: 15px; border-bottom: 2px solid #85cbd6; padding-bottom: 4px; margin: 22px 0 8px; }
  p { margin: 6px 0; font-size: 13.5px; }
  ul { margin: 6px 0; padding-left: 20px; font-size: 13.5px; }
  li { margin: 3px 0; }
  .sig { display: inline-block; width: 46%; margin: 18px 2% 0 0; vertical-align: top; }
  .sig .who { font-weight: bold; font-size: 13px; }
  .sig .role { font-weight: normal; color: #666; }
  .sig .line { margin-top: 26px; color: #444; font-size: 12.5px; }
  .print { text-align: center; margin: 26px 0; }
  .print button { background: #85cbd6; color: #063; border: none; border-radius: 8px; padding: 10px 18px; font-weight: bold; cursor: pointer; }
  @media print { .print { display: none; } }
</style></head>
<body>
${bodyHtml}
<div class="print"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
</body></html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    next(err);
  }
}

// Contrats d'une annonce vus par un colocataire (ou l'owner/staff) : sa part + s'il a paye.
async function myContractsForAnnonce(req, res, next) {
  try {
    const annonceId = Number(req.params.id);
    if (!Number.isInteger(annonceId) || annonceId <= 0) {
      return res.status(400).json({ message: 'Annonce invalide.' });
    }
    const arows = await query('SELECT id_utilisateur AS owner_id, total_colocataires FROM annonces WHERE id_annonce = ? LIMIT 1', [annonceId]);
    if (!arows.length) return res.status(404).json({ message: 'Annonce introuvable.' });
    const ownerId = Number(arows[0].owner_id);
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const isStaff = ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);

    const contrats = await query('SELECT id_contrat, reference, type, montant_total FROM contrats WHERE id_annonce = ? ORDER BY id_contrat', [annonceId]);
    const result = [];
    for (const c of contrats) {
      const parties = await query("SELECT id_utilisateur, role FROM parties_contrats WHERE id_contrat = ? AND id_utilisateur IS NOT NULL", [c.id_contrat]);
      const colocIds = parties.filter((p) => /coloc/i.test(p.role || '')).map((p) => Number(p.id_utilisateur));
      const isColoc = colocIds.includes(currentUserId);
      if (!isColoc && currentUserId !== ownerId && !isStaff) continue;
      const nb = Math.max(1, colocIds.length || Number(arows[0].total_colocataires) || 1);
      const part = Math.ceil(Number(c.montant_total || 0) / nb);
      const paidRows = await query("SELECT DISTINCT id_utilisateur FROM paiements WHERE id_contrat = ? AND service_type = 'contrat'", [c.id_contrat]);
      const payerIds = paidRows.map((r) => Number(r.id_utilisateur));
      result.push({
        id_contrat: c.id_contrat,
        reference: c.reference,
        type: c.type,
        montant_total: Number(c.montant_total || 0),
        ma_part: part,
        deja_paye: payerIds.includes(currentUserId),
        paidCount: payerIds.length,
        total: nb,
        peut_payer: isColoc,
      });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// Lancement OFFICIEL de la colocation par le deposant, une fois que TOUS les
// colocataires ont regle leur part de chaque contrat.
async function lancerColocationOfficielle(req, res, next) {
  try {
    const annonceId = Number(req.params.id);
    if (!Number.isInteger(annonceId) || annonceId <= 0) {
      return res.status(400).json({ message: 'Annonce invalide.' });
    }
    const arows = await query('SELECT id_utilisateur AS owner_id, statut FROM annonces WHERE id_annonce = ? LIMIT 1', [annonceId]);
    if (!arows.length) return res.status(404).json({ message: 'Annonce introuvable.' });
    const ownerId = Number(arows[0].owner_id);
    const currentUserId = Number(req.user?.id ?? req.user?.id_utilisateur ?? req.user?.userId ?? req.user?.sub);
    const userRole = String(req.user?.role || req.user?.poste || '').toLowerCase();
    const isStaff = ['super_admin', 'superadmin', 'admin', 'moderator', 'moderateur'].includes(userRole);
    if (currentUserId !== ownerId && !isStaff) {
      return res.status(403).json({ message: 'Seul le déposant peut lancer officiellement la colocation.' });
    }
    if (arows[0].statut === 'terminee') {
      return res.status(409).json({ message: 'La colocation est déjà lancée officiellement.' });
    }

    const contrats = await query('SELECT id_contrat FROM contrats WHERE id_annonce = ?', [annonceId]);
    if (!contrats.length) {
      return res.status(400).json({ message: "Aucun contrat n'a encore été créé." });
    }
    for (const c of contrats) {
      const parties = await query("SELECT id_utilisateur, role FROM parties_contrats WHERE id_contrat = ? AND id_utilisateur IS NOT NULL", [c.id_contrat]);
      const colocIds = parties.filter((p) => /coloc/i.test(p.role || '')).map((p) => Number(p.id_utilisateur));
      const paid = await query("SELECT DISTINCT id_utilisateur FROM paiements WHERE id_contrat = ? AND service_type = 'contrat'", [c.id_contrat]);
      const payerIds = paid.map((r) => Number(r.id_utilisateur));
      if (!colocIds.every((id) => payerIds.includes(id))) {
        return res.status(400).json({ message: "Tous les colocataires n'ont pas encore réglé leur part." });
      }
    }

    await query("UPDATE annonces SET statut = 'terminee', date_modification = NOW() WHERE id_annonce = ?", [annonceId]);
    return res.json({ message: 'Colocation lancée officiellement ! L\'annonce est clôturée.', statut: 'terminee' });
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
  generateContractDocument,
  myContractsForAnnonce,
  lancerColocationOfficielle,
};
