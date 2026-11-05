const { query, insertAndGetId } = require('../Services/db.service');
const path = require('path');
const fs = require('fs');

const CAMPAIGN_PLACEMENTS = ['carte', 'fil_annonces', 'bandeau_regional', 'page_partenaire'];
const CAMPAIGN_STATUSES = ['active', 'programmee', 'suspendue', 'terminee'];
const CAMPAIGN_STATUS_SQL = `
  CASE
    WHEN c.statut = 'suspendue' THEN 'suspendue'
    WHEN DATE(c.date_debut) > CURRENT_DATE() THEN 'programmee'
    WHEN c.date_fin IS NOT NULL AND DATE(c.date_fin) < CURRENT_DATE() THEN 'terminee'
    ELSE 'active'
  END
`;

let campaignCitySchemaPromise;
async function ensureCampaignCitySchema() {
  if (!campaignCitySchemaPromise) {
    campaignCitySchemaPromise = (async () => {
      const columns = await query(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
        ['campagnes', 'id_ville']
      );
      if (!columns.length) {
        await query('ALTER TABLE campagnes ADD COLUMN id_ville INT NULL AFTER id_partenaire');
      }

      const foreignKeys = await query(
        `SELECT CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'campagnes'
           AND COLUMN_NAME = 'id_ville'
           AND REFERENCED_TABLE_NAME = 'villes'
         LIMIT 1`
      );
      if (!foreignKeys.length) {
        await query(
          'ALTER TABLE campagnes ADD CONSTRAINT fk_campagnes_ville FOREIGN KEY (id_ville) REFERENCES villes (id_ville) ON DELETE SET NULL'
        );
      }
    })().catch((error) => {
      campaignCitySchemaPromise = undefined;
      throw error;
    });
  }
  await campaignCitySchemaPromise;
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function asDateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function validCampaignDates(startDate, endDate) {
  return isValidDateOnly(startDate)
    && (!endDate || (isValidDateOnly(endDate) && endDate >= startDate));
}

function parseCityId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : Number.NaN;
}

// Récupérer les campagnes publiques liées aux partenaires
async function listPublic(req, res, next) {
  try {
    await ensureCampaignCitySchema();
    const rows = await query(`
      SELECT
        c.id_campagne,
        c.id_partenaire,
        c.titre,
        c.description,
        c.emplacement,
        c.visuel,
        c.date_debut,
        c.date_fin,
        ${CAMPAIGN_STATUS_SQL} AS statut,
        c.date_creation,
        p.nom AS partenaire_nom,
        p.secteur,
        p.niveau,
        p.remise,
        p.engagement,
        p.logo,
        p.actif,
        c.id_ville,
        v.nom_ville AS ville_nom
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      LEFT JOIN villes v ON v.id_ville = c.id_ville
      WHERE COALESCE(c.statut, 'active') <> 'suspendue'
        AND DATE(c.date_debut) <= CURRENT_DATE()
        AND (c.date_fin IS NULL OR DATE(c.date_fin) >= CURRENT_DATE())
        AND COALESCE(p.actif, 1) = 1
      ORDER BY c.date_creation DESC, c.date_debut DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ Erreur listPublic campagnes:', err);
    next(err);
  }
}

// Récupérer toutes les campagnes
async function listAll(req, res, next) {
  try {
    await ensureCampaignCitySchema();
    const rows = await query(`
      SELECT c.*, ${CAMPAIGN_STATUS_SQL} AS statut_calcule,
        p.nom as partenaire_nom, p.niveau as partenaire_niveau, v.nom_ville AS ville_nom
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      LEFT JOIN villes v ON v.id_ville = c.id_ville
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
    await ensureCampaignCitySchema();
    const { id } = req.params;
    const rows = await query(`
      SELECT c.*, ${CAMPAIGN_STATUS_SQL} AS statut_calcule,
        p.nom as partenaire_nom, p.niveau as partenaire_niveau, v.nom_ville AS ville_nom
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      LEFT JOIN villes v ON v.id_ville = c.id_ville
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
    await ensureCampaignCitySchema();
    const {
      id_partenaire, 
      titre, 
      description, 
      emplacement, 
      visuel, 
      date_debut, 
      date_fin,
      statut,
      id_ville,
    } = req.body;
    
    if (!id_partenaire || !titre || !date_debut) {
      return res.status(400).json({ 
        message: 'Partenaire, titre et date de début sont requis.' 
      });
    }
    const campaignPlacement = emplacement || 'fil_annonces';
    if (!CAMPAIGN_PLACEMENTS.includes(campaignPlacement)) {
      return res.status(400).json({ message: 'Emplacement de campagne invalide.' });
    }
    if (!validCampaignDates(date_debut, date_fin || null)) {
      return res.status(400).json({ message: 'Les dates de campagne sont invalides.' });
    }
    if (statut !== undefined && !CAMPAIGN_STATUSES.includes(statut)) {
      return res.status(400).json({ message: 'Statut de campagne invalide.' });
    }
    const cityId = campaignPlacement === 'bandeau_regional' ? parseCityId(id_ville) : null;
    if (Number.isNaN(cityId) || (campaignPlacement === 'bandeau_regional' && !cityId)) {
      return res.status(400).json({ message: 'Une ville doit être sélectionnée pour un bandeau régional.' });
    }
    if (cityId) {
      const city = await query('SELECT id_ville FROM villes WHERE id_ville = ?', [cityId]);
      if (!city.length) return res.status(400).json({ message: 'Ville de campagne introuvable.' });
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
        id_ville,
        titre, 
        description, 
        emplacement, 
        visuel, 
        date_debut, 
        date_fin, 
        statut
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_partenaire,
      cityId,
      titre.trim(), 
      description || null, 
      campaignPlacement,
      visuel || null, 
      date_debut, 
      date_fin || null, 
      statut === 'suspendue' ? 'suspendue' : 'active'
    ]);

    // Récupérer la campagne créée
    const created = await query(`
      SELECT c.*, ${CAMPAIGN_STATUS_SQL} AS statut_calcule,
        p.nom as partenaire_nom, p.niveau as partenaire_niveau, v.nom_ville AS ville_nom
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      LEFT JOIN villes v ON v.id_ville = c.id_ville
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
    await ensureCampaignCitySchema();
    const { id } = req.params;
    const {
      id_partenaire, 
      titre, 
      description, 
      emplacement, 
      visuel, 
      date_debut, 
      date_fin, 
      statut,
      id_ville,
    } = req.body;
    
    // Vérifier que la campagne existe
    const existing = await query(
      'SELECT id_campagne, id_partenaire, emplacement, id_ville, date_debut, date_fin FROM campagnes WHERE id_campagne = ?',
      [id]
    );
    
    if (!existing.length) {
      return res.status(404).json({ message: 'Campagne introuvable.' });
    }

    const startDate = date_debut === undefined ? asDateOnly(existing[0].date_debut) : date_debut;
    const endDate = date_fin === undefined ? asDateOnly(existing[0].date_fin) || null : date_fin;
    if (!validCampaignDates(startDate, endDate)) {
      return res.status(400).json({ message: 'Les dates de campagne sont invalides.' });
    }
    if (emplacement !== undefined && !CAMPAIGN_PLACEMENTS.includes(emplacement)) {
      return res.status(400).json({ message: 'Emplacement de campagne invalide.' });
    }
    if (statut !== undefined && !CAMPAIGN_STATUSES.includes(statut)) {
      return res.status(400).json({ message: 'Statut de campagne invalide.' });
    }
    const campaignPlacement = emplacement === undefined ? existing[0].emplacement : emplacement;
    let cityId = id_ville === undefined ? existing[0].id_ville : parseCityId(id_ville);
    if (campaignPlacement !== 'bandeau_regional') cityId = null;
    if (Number.isNaN(cityId) || (campaignPlacement === 'bandeau_regional' && !cityId)) {
      return res.status(400).json({ message: 'Une ville doit être sélectionnée pour un bandeau régional.' });
    }
    if (cityId) {
      const city = await query('SELECT id_ville FROM villes WHERE id_ville = ?', [cityId]);
      if (!city.length) return res.status(400).json({ message: 'Ville de campagne introuvable.' });
    }
    if (id_partenaire !== undefined) {
      const partenaire = await query(
        'SELECT id_partenaire FROM partenaires WHERE id_partenaire = ?',
        [id_partenaire]
      );
      if (!partenaire.length) {
        return res.status(404).json({ message: 'Partenaire introuvable.' });
      }
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
    if (id_ville !== undefined || emplacement !== undefined) {
      sets.push('id_ville = ?');
      values.push(cityId);
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
      values.push(statut === 'suspendue' ? 'suspendue' : 'active');
    }
    
    if (sets.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }
    
    values.push(id);
    await query(`UPDATE campagnes SET ${sets.join(', ')} WHERE id_campagne = ?`, values);
    
    console.log(`✅ Campagne ${id} mise à jour`);

    // Récupérer la campagne mise à jour
    const updated = await query(`
      SELECT c.*, ${CAMPAIGN_STATUS_SQL} AS statut_calcule,
        p.nom as partenaire_nom, p.niveau as partenaire_niveau, v.nom_ville AS ville_nom
      FROM campagnes c
      LEFT JOIN partenaires p ON p.id_partenaire = c.id_partenaire
      LEFT JOIN villes v ON v.id_ville = c.id_ville
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
  listPublic,
  listAll,
  getOne,
  create,
  update,
  remove,
  uploadVisuel,
};