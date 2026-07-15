const { query, insertAndGetId } = require('../Services/db.service');
const path = require('path');
const fs = require('fs');

// Récupérer toutes les campagnes
async function listAll(req, res, next) {
  try {
    const rows = await query(`
      SELECT c.*, p.nom as partenaire_nom, p.niveau as partenaire_niveau
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      ORDER BY c.date_creation DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ Erreur listAll campagnes:', err);
    next(err);
  }
}

// Récupérer une campagne par son ID
async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`
      SELECT c.*, p.nom as partenaire_nom, p.niveau as partenaire_niveau
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      WHERE c.id_campagne = ?
    `, [id]);
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Campagne introuvable.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Erreur getOne campagne:', err);
    next(err);
  }
}

// Créer une campagne
async function create(req, res, next) {
  try {
    const { 
      id_partenaire, 
      titre, 
      description, 
      emplacement, 
      visuel, 
      date_debut, 
      date_fin, 
      statut 
    } = req.body;
    
    console.log('📝 Création campagne:', { id_partenaire, titre, description, emplacement, date_debut, date_fin, statut });
    
    if (!id_partenaire || !titre || !date_debut) {
      return res.status(400).json({ 
        message: 'Partenaire, titre et date de début sont requis.' 
      });
    }

    // Vérifier que le partenaire existe
    const partenaire = await query(
      'SELECT id_partenaire, nom FROM partenaires WHERE id_partenaire = ?',
      [id_partenaire]
    );
    
    if (!partenaire.length) {
      return res.status(404).json({ message: 'Partenaire introuvable.' });
    }

    const id_campagne = await insertAndGetId(`
      INSERT INTO campagnes (
        id_partenaire, 
        titre, 
        description, 
        emplacement, 
        visuel, 
        date_debut, 
        date_fin, 
        statut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_partenaire, 
      titre.trim(), 
      description || null, 
      emplacement || 'fil_annonces', 
      visuel || null, 
      date_debut, 
      date_fin || null, 
      statut || 'programmee'
    ]);

    console.log(`✅ Campagne créée avec l'ID: ${id_campagne}`);

    // Récupérer la campagne créée
    const created = await query(`
      SELECT c.*, p.nom as partenaire_nom, p.niveau as partenaire_niveau
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      WHERE c.id_campagne = ?
    `, [id_campagne]);

    res.status(201).json({ 
      id_campagne, 
      message: 'Campagne créée avec succès.',
      campagne: created[0]
    });
  } catch (err) {
    console.error('❌ Erreur create campagne:', err);
    next(err);
  }
}

// Mettre à jour une campagne
async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { 
      id_partenaire, 
      titre, 
      description, 
      emplacement, 
      visuel, 
      date_debut, 
      date_fin, 
      statut 
    } = req.body;
    
    // Vérifier que la campagne existe
    const existing = await query(
      'SELECT id_campagne FROM campagnes WHERE id_campagne = ?',
      [id]
    );
    
    if (!existing.length) {
      return res.status(404).json({ message: 'Campagne introuvable.' });
    }

    const sets = [];
    const values = [];
    
    if (id_partenaire !== undefined) { 
      sets.push('id_partenaire = ?'); 
      values.push(id_partenaire); 
    }
    if (titre !== undefined) { 
      sets.push('titre = ?'); 
      values.push(titre.trim()); 
    }
    if (description !== undefined) { 
      sets.push('description = ?'); 
      values.push(description || null); 
    }
    if (emplacement !== undefined) { 
      sets.push('emplacement = ?'); 
      values.push(emplacement); 
    }
    if (visuel !== undefined) { 
      sets.push('visuel = ?'); 
      values.push(visuel || null); 
    }
    if (date_debut !== undefined) { 
      sets.push('date_debut = ?'); 
      values.push(date_debut); 
    }
    if (date_fin !== undefined) { 
      sets.push('date_fin = ?'); 
      values.push(date_fin || null); 
    }
    if (statut !== undefined) { 
      sets.push('statut = ?'); 
      values.push(statut); 
    }
    
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }
    
    values.push(id);
    await query(`UPDATE campagnes SET ${sets.join(', ')} WHERE id_campagne = ?`, values);
    
    console.log(`✅ Campagne ${id} mise à jour`);

    // Récupérer la campagne mise à jour
    const updated = await query(`
      SELECT c.*, p.nom as partenaire_nom, p.niveau as partenaire_niveau
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      WHERE c.id_campagne = ?
    `, [id]);

    res.json({ 
      message: 'Campagne mise à jour avec succès.',
      campagne: updated[0]
    });
  } catch (err) {
    console.error('❌ Erreur update campagne:', err);
    next(err);
  }
}

// Supprimer une campagne
async function remove(req, res, next) {
  try {
    const { id } = req.params;
    
    // Vérifier que la campagne existe
    const existing = await query(
      'SELECT id_campagne, visuel FROM campagnes WHERE id_campagne = ?',
      [id]
    );
    
    if (!existing.length) {
      return res.status(404).json({ message: 'Campagne introuvable.' });
    }

    // Supprimer le fichier visuel si existe
    if (existing[0].visuel) {
      const filePath = path.join(__dirname, '..', '..', 'public', 'uploads', 'campagnes', path.basename(existing[0].visuel));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Fichier visuel supprimé: ${filePath}`);
      }
    }

    await query('DELETE FROM campagnes WHERE id_campagne = ?', [id]);
    
    console.log(`✅ Campagne ${id} supprimée`);
    res.json({ message: 'Campagne supprimée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur remove campagne:', err);
    next(err);
  }
}

// Upload d'un visuel de campagne
async function uploadVisuel(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier fourni.' });
    }
    
    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Supprimer le fichier uploadé
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        message: 'Format de fichier non supporté. Utilisez JPG, PNG, WEBP, GIF ou SVG.' 
      });
    }

    // Vérifier la taille (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        message: 'Le fichier est trop lourd. Taille maximum: 5MB.' 
      });
    }

    const url = `/uploads/campagnes/${req.file.filename}`;
    console.log(`✅ Visuel uploadé: ${url}`);
    
    res.json({ 
      url, 
      filename: req.file.filename,
      message: 'Visuel uploadé avec succès.'
    });
  } catch (err) {
    console.error('❌ Erreur uploadVisuel campagne:', err);
    // Nettoyer le fichier en cas d'erreur
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
}

module.exports = {
  listAll,
  getOne,
  create,
  update,
  remove,
  uploadVisuel,
};