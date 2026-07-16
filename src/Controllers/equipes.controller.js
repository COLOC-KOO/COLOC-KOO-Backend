const { query, insertAndGetId } = require('../Services/db.service');

// ============================================================================
//  Equipes de colocation (table `equipes` + `membres_equipes`).
//  CRUD utilise par le front (api.getEquipesByAnnonce, createEquipe, ...).
//  Le flux candidatures cree/maj les equipes de son cote (candidatures.controller).
// ============================================================================

function initials(prenom, nom) {
  return `${(prenom || '')[0] || ''}${(nom || '')[0] || ''}`.toUpperCase() || 'U';
}

// Charge les membres d'une equipe (avec infos utilisateur).
async function membresOf(idEquipe) {
  const rows = await query(
    `SELECT m.id_utilisateur, m.statut, u.nom, u.prenom, u.email
     FROM membres_equipes m
     JOIN utilisateurs u ON u.id_utilisateur = m.id_utilisateur
     WHERE m.id_equipe = ?
     ORDER BY m.date_ajout`,
    [idEquipe]
  );
  return rows.map((r) => ({
    id_utilisateur: r.id_utilisateur,
    nom: r.nom,
    prenom: r.prenom,
    email: r.email,
    statut: r.statut,
    initials: initials(r.prenom, r.nom),
  }));
}

async function mapEquipe(row) {
  return {
    id_equipe: row.id_equipe,
    id_annonce: row.id_annonce,
    nom: row.nom,
    ambiance: row.ambiance,
    statut: row.statut,
    date_creation: row.date_creation,
    membres: await membresOf(row.id_equipe),
  };
}

// GET /api/equipes/annonces/:annonceId
async function listByAnnonce(req, res, next) {
  try {
    const rows = await query(
      'SELECT * FROM equipes WHERE id_annonce = ? ORDER BY date_creation DESC',
      [req.params.annonceId]
    );
    const equipes = [];
    for (const row of rows) equipes.push(await mapEquipe(row));
    res.json(equipes);
  } catch (err) {
    next(err);
  }
}

// GET /api/equipes/:id
async function getOne(req, res, next) {
  try {
    const rows = await query('SELECT * FROM equipes WHERE id_equipe = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Equipe introuvable.' });
    res.json(await mapEquipe(rows[0]));
  } catch (err) {
    next(err);
  }
}

// POST /api/equipes
async function create(req, res, next) {
  try {
    const { id_annonce, nom, ambiance = null, statut = 'forming' } = req.body || {};
    if (!id_annonce || !nom) {
      return res.status(400).json({ message: 'id_annonce et nom sont obligatoires.' });
    }
    const id_equipe = await insertAndGetId(
      'INSERT INTO equipes (id_annonce, nom, ambiance, statut) VALUES (?, ?, ?, ?)',
      [id_annonce, String(nom).slice(0, 255), ambiance, statut]
    );
    res.status(201).json({ id_equipe, message: 'Equipe creee.' });
  } catch (err) {
    next(err);
  }
}

// PUT /api/equipes/:id
async function update(req, res, next) {
  try {
    const { nom, ambiance, statut } = req.body || {};
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(String(nom).slice(0, 255)); }
    if (ambiance !== undefined) { fields.push('ambiance = ?'); values.push(ambiance); }
    if (statut !== undefined) { fields.push('statut = ?'); values.push(statut); }
    if (!fields.length) return res.status(400).json({ message: 'Aucune modification.' });
    values.push(req.params.id);
    await query(`UPDATE equipes SET ${fields.join(', ')} WHERE id_equipe = ?`, values);
    res.json({ message: 'Equipe mise a jour.' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/equipes/:id
async function remove(req, res, next) {
  try {
    await query('DELETE FROM membres_equipes WHERE id_equipe = ?', [req.params.id]);
    await query('DELETE FROM equipes WHERE id_equipe = ?', [req.params.id]);
    res.json({ message: 'Equipe supprimee.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/equipes/:equipeId/membres  { id_utilisateur }
async function addMembre(req, res, next) {
  try {
    const { id_utilisateur } = req.body || {};
    if (!id_utilisateur) return res.status(400).json({ message: 'id_utilisateur obligatoire.' });

    const existing = await query(
      'SELECT id FROM membres_equipes WHERE id_equipe = ? AND id_utilisateur = ? LIMIT 1',
      [req.params.equipeId, id_utilisateur]
    );
    if (existing.length) {
      await query(
        "UPDATE membres_equipes SET statut = 'accepted' WHERE id_equipe = ? AND id_utilisateur = ?",
        [req.params.equipeId, id_utilisateur]
      );
    } else {
      await query(
        "INSERT INTO membres_equipes (id_equipe, id_utilisateur, statut) VALUES (?, ?, 'accepted')",
        [req.params.equipeId, id_utilisateur]
      );
    }
    res.status(201).json({ message: 'Membre ajoute.' });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/equipes/:equipeId/membres/:userId
async function removeMembre(req, res, next) {
  try {
    await query('DELETE FROM membres_equipes WHERE id_equipe = ? AND id_utilisateur = ?', [
      req.params.equipeId,
      req.params.userId,
    ]);
    res.json({ message: 'Membre retire.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listByAnnonce, getOne, create, update, remove, addMembre, removeMembre };
