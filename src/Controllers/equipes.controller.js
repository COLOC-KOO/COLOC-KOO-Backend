const { query, insertAndGetId } = require('../Services/db.service');

// Récupérer toutes les équipes d'une annonce
async function listByAnnonce(req, res, next) {
  try {
    const { annonceId } = req.params;
    
    console.log(`📊 Récupération des équipes pour l'annonce: ${annonceId}`);
    
    const rows = await query(
      `SELECT id_equipe, id_annonce, nom, ambiance, statut, date_creation 
       FROM equipes 
       WHERE id_annonce = ? 
       ORDER BY date_creation DESC`,
      [annonceId]
    );

    // Pour chaque équipe, récupérer les membres
    const equipesWithMembers = await Promise.all(rows.map(async (equipe) => {
      const membres = await query(
        `SELECT me.id, me.id_utilisateur, me.statut, u.nom, u.prenom, u.email
         FROM membres_equipes me
         LEFT JOIN utilisateurs u ON u.id_utilisateur = me.id_utilisateur
         WHERE me.id_equipe = ?`,
        [equipe.id_equipe]
      );
      return {
        ...equipe,
        membres: membres.map(m => ({
          id_utilisateur: m.id_utilisateur,
          nom: m.nom || '',
          prenom: m.prenom || '',
          email: m.email || '',
          statut: m.statut || 'pending',
          initials: (m.prenom?.[0] || '') + (m.nom?.[0] || '') || m.email?.[0]?.toUpperCase() || '?'
        }))
      };
    }));

    res.json(equipesWithMembers);
  } catch (err) {
    console.error('❌ Erreur listByAnnonce:', err);
    next(err);
  }
}

// Récupérer une équipe par son ID
async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    
    const rows = await query(
      `SELECT id_equipe, id_annonce, nom, ambiance, statut, date_creation 
       FROM equipes 
       WHERE id_equipe = ?`,
       [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Équipe introuvable.' });
    }

    const membres = await query(
      `SELECT me.id, me.id_utilisateur, me.statut, u.nom, u.prenom, u.email
       FROM membres_equipes me
       LEFT JOIN utilisateurs u ON u.id_utilisateur = me.id_utilisateur
       WHERE me.id_equipe = ?`,
       [id]
    );

    res.json({
      ...rows[0],
      membres: membres.map(m => ({
        id_utilisateur: m.id_utilisateur,
        nom: m.nom || '',
        prenom: m.prenom || '',
        email: m.email || '',
        statut: m.statut || 'pending',
        initials: (m.prenom?.[0] || '') + (m.nom?.[0] || '') || m.email?.[0]?.toUpperCase() || '?'
      }))
    });
  } catch (err) {
    console.error('❌ Erreur getOne:', err);
    next(err);
  }
}

// Créer une équipe
async function create(req, res, next) {
  try {
    const { id_annonce, nom, ambiance, statut = 'forming' } = req.body;
    
    console.log('📝 Création d\'équipe:', { id_annonce, nom, ambiance, statut });
    
    if (!id_annonce || !nom) {
      return res.status(400).json({ 
        message: 'L\'annonce et le nom de l\'équipe sont requis.' 
      });
    }

    // Vérifier que l'annonce existe
    const annonce = await query(
      'SELECT id_annonce, id_utilisateur, titre FROM annonces WHERE id_annonce = ?',
      [id_annonce]
    );
    
    if (!annonce.length) {
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    // Vérifier si une équipe avec ce nom existe déjà pour cette annonce
    const existing = await query(
      'SELECT id_equipe FROM equipes WHERE id_annonce = ? AND nom = ?',
      [id_annonce, nom]
    );
    
    if (existing.length) {
      return res.status(400).json({ 
        message: 'Une équipe avec ce nom existe déjà pour cette annonce.' 
      });
    }

    const id_equipe = await insertAndGetId(
      `INSERT INTO equipes (id_annonce, nom, ambiance, statut) 
       VALUES (?, ?, ?, ?)`,
      [id_annonce, nom, ambiance || null, statut]
    );

    console.log(`✅ Équipe créée avec l'ID: ${id_equipe}`);

    // Si un utilisateur est connecté, l'ajouter comme membre de l'équipe
    if (req.user && req.user.id) {
      await query(
        `INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut) 
         VALUES (?, ?, 'owner')`,
        [id_equipe, req.user.id]
      );
      console.log(`👤 Utilisateur ${req.user.id} ajouté comme propriétaire de l'équipe`);
    }

    const created = await query(
      'SELECT * FROM equipes WHERE id_equipe = ?',
      [id_equipe]
    );

    res.status(201).json(created[0]);
  } catch (err) {
    console.error('❌ Erreur création équipe:', err);
    next(err);
  }
}

// Mettre à jour une équipe
async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { nom, ambiance, statut } = req.body;
    
    const sets = [];
    const values = [];
    
    if (nom !== undefined) {
      sets.push('nom = ?');
      values.push(nom);
    }
    if (ambiance !== undefined) {
      sets.push('ambiance = ?');
      values.push(ambiance);
    }
    if (statut !== undefined) {
      sets.push('statut = ?');
      values.push(statut);
    }
    
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }

    values.push(id);
    await query(
      `UPDATE equipes SET ${sets.join(', ')} WHERE id_equipe = ?`,
      values
    );

    const updated = await query(
      'SELECT * FROM equipes WHERE id_equipe = ?',
      [id]
    );
    
    if (!updated.length) {
      return res.status(404).json({ message: 'Équipe introuvable.' });
    }

    res.json(updated[0]);
  } catch (err) {
    console.error('❌ Erreur update:', err);
    next(err);
  }
}

// Supprimer une équipe
async function remove(req, res, next) {
  try {
    const { id } = req.params;
    
    // Supprimer d'abord les membres de l'équipe
    await query('DELETE FROM membres_equipes WHERE id_equipe = ?', [id]);
    
    // Puis supprimer l'équipe
    await query('DELETE FROM equipes WHERE id_equipe = ?', [id]);
    
    res.json({ message: 'Équipe supprimée.' });
  } catch (err) {
    console.error('❌ Erreur remove:', err);
    next(err);
  }
}

// Ajouter un membre à une équipe
async function addMember(req, res, next) {
  try {
    const { id } = req.params;
    const { id_utilisateur } = req.body;
    
    if (!id_utilisateur) {
      return res.status(400).json({ message: 'ID utilisateur requis.' });
    }

    // Vérifier si l'équipe existe
    const equipe = await query(
      'SELECT id_equipe, statut FROM equipes WHERE id_equipe = ?',
      [id]
    );
    
    if (!equipe.length) {
      return res.status(404).json({ message: 'Équipe introuvable.' });
    }

    // Vérifier si l'utilisateur est déjà membre
    const existing = await query(
      'SELECT id FROM membres_equipes WHERE id_equipe = ? AND id_utilisateur = ?',
      [id, id_utilisateur]
    );
    
    if (existing.length) {
      return res.status(400).json({ message: 'Cet utilisateur est déjà membre de l\'équipe.' });
    }

    await query(
      `INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut) 
       VALUES (?, ?, 'pending')`,
      [id, id_utilisateur]
    );

    res.json({ message: 'Membre ajouté avec succès.' });
  } catch (err) {
    console.error('❌ Erreur addMember:', err);
    next(err);
  }
}

// Retirer un membre d'une équipe
async function removeMember(req, res, next) {
  try {
    const { id, userId } = req.params;
    
    // Vérifier si l'utilisateur est propriétaire de l'équipe
    const ownerCheck = await query(
      'SELECT id FROM membres_equipes WHERE id_equipe = ? AND id_utilisateur = ? AND statut = "owner"',
      [id, userId]
    );
    
    // Si c'est le propriétaire, on ne peut pas le retirer sans supprimer l'équipe
    if (ownerCheck.length) {
      return res.status(400).json({ 
        message: 'Le propriétaire de l\'équipe ne peut pas en être retiré. Pour supprimer l\'équipe, utilisez la suppression d\'équipe.' 
      });
    }
    
    await query(
      'DELETE FROM membres_equipes WHERE id_equipe = ? AND id_utilisateur = ?',
      [id, userId]
    );
    
    res.json({ message: 'Membre retiré avec succès.' });
  } catch (err) {
    console.error('❌ Erreur removeMember:', err);
    next(err);
  }
}

// Exporter toutes les fonctions
module.exports = {
  listByAnnonce,
  getOne,
  create,
  update,
  remove,
  addMember,
  removeMember,
};