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
             u.id_utilisateur as utilisateur_id, u.nom, u.prenom, u.email, u.telephone,
             a.titre, a.quartier, a.id_annonce AS annonce_id, ch.prix_loyer
      FROM candidatures c
      LEFT JOIN utilisateurs u ON u.id_utilisateur = c.id_utilisateur
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
  updateStatus
};
