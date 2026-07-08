const { query, insertAndGetId } = require('../Services/db.service');
const { mapAnnonceRow, hydrateAnnonce } = require('../Services/mappers');

async function list(req, res, next) {
  try {
    const { q, type, ville, quartier, minPrice, maxPrice, statut: rawStatut = 'active', mine, service } = req.query;
    const clauses = [];
    const values = [];
    const isMine = mine === '1' || mine === 'true' || mine === true;
    const statut = isMine && rawStatut === 'active' ? 'all' : rawStatut;

    if (isMine) {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentification requise.' });
      }
      clauses.push('a.id_utilisateur = ?');
      values.push(req.user.id);
    }

    if (statut && statut !== 'all') {
      clauses.push('a.statut = ?');
      values.push(statut);
    }
    if (type && type !== 'all') {
      if (['appartement', 'maison', 'autre'].includes(type)) {
        clauses.push('a.type_propriete = ?');
        values.push(type);
      } else if (type === 'chambre') {
        clauses.push('ch.id_chambre IS NOT NULL');
      } else {
        clauses.push('a.type_annonce = ?');
        values.push(type === 'proprio' ? 'creation' : 'existante');
      }
    }
    if (ville) {
      clauses.push('LOWER(v.nom_ville) LIKE ?');
      values.push(`%${String(ville).toLowerCase()}%`);
    }
    if (quartier) {
      clauses.push('LOWER(a.quartier) LIKE ?');
      values.push(`%${String(quartier).toLowerCase()}%`);
    }
    if (minPrice) {
      clauses.push('COALESCE(ch.prix_loyer, 0) >= ?');
      values.push(Number(minPrice));
    }
    if (maxPrice) {
      clauses.push('COALESCE(ch.prix_loyer, 0) <= ?');
      values.push(Number(maxPrice));
    }
    if (q) {
      clauses.push('(a.titre LIKE ? OR a.description LIKE ? OR v.nom_ville LIKE ? OR a.quartier LIKE ?)');
      values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (service) {
      const serviceId = Number(service);
      if (!Number.isNaN(serviceId)) {
        clauses.push(
          `EXISTS (
            SELECT 1
            FROM demandes_ckoo d
            JOIN lignes_demandes_ckoo ld ON ld.id_demande = d.id_demande
            WHERE d.id_annonce = a.id_annonce
              AND ld.id_service = ?
          )`
        );
        values.push(serviceId);
      }
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    await query('SET SESSION group_concat_max_len = 1000000');
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
            v.nom_ville, r.nom_region,
            MIN(ch.surface) AS chambre_surface, 
            MIN(ch.prix_loyer) AS prix_loyer, 
            MIN(ch.date_disponibilite) AS date_disponibilite,
            GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
            GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
            GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
      FROM annonces a
      JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
      JOIN villes v ON v.id_ville = a.id_ville
      JOIN regions r ON r.id_region = v.id_region
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
      ${whereSql}
      GROUP BY a.id_annonce
      ORDER BY a.date_creation DESC
      LIMIT 500
      `,
      values
    );

    res.json(rows.map(mapAnnonceRow));
  } catch (err) {
    next(err);
  }
}

// async function getById(req, res, next) {
//   try {
//     await query('SET SESSION group_concat_max_len = 1000000');
//     const rows = await query(
//       `
//       SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
//              v.nom_ville, r.nom_region,
//              ch.surface AS chambre_surface, ch.prix_loyer, ch.date_disponibilite,
//              GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
//              GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
//              GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
//       FROM annonces a
//       JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
//       JOIN villes v ON v.id_ville = a.id_ville
//       JOIN regions r ON r.id_region = v.id_region
//       LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
//       LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
//       LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
//       LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
//       WHERE a.id_annonce = ?
//       GROUP BY a.id_annonce
//       LIMIT 1
//       `,
//       [req.params.id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ message: 'Annonce introuvable.' });
//     }

//     const annonce = mapAnnonceRow(rows[0]);
//     annonce.photos = await getPhotoUrlsByAnnonce(req.params.id);
//     const extra = await hydrateAnnonce(req.params.id);
//     res.json({ ...annonce, ...extra });
//   } catch (err) {
//     next(err);
//   }
// }

// ✅ CORRECTION : Utiliser MIN() pour les colonnes non agrégées
async function getById(req, res, next) {
  try {
    await query('SET SESSION group_concat_max_len = 1000000');
    const rows = await query(
      `
      SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
             v.nom_ville, r.nom_region,
             MIN(ch.surface) AS chambre_surface, 
             MIN(ch.prix_loyer) AS prix_loyer, 
             MIN(ch.date_disponibilite) AS date_disponibilite,
             GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
             GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
             GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
      FROM annonces a
      JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
      JOIN villes v ON v.id_ville = a.id_ville
      JOIN regions r ON r.id_region = v.id_region
      LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
      LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
      LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
      LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
      WHERE a.id_annonce = ?
      GROUP BY a.id_annonce
      LIMIT 1
      `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable.' });
    }

    const annonce = mapAnnonceRow(rows[0]);
    annonce.photos = await getPhotoUrlsByAnnonce(req.params.id);
    const extra = await hydrateAnnonce(req.params.id);
    res.json({ ...annonce, ...extra });
  } catch (err) {
    next(err);
  }
}

async function uploadPhotos(req, res, next) {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'Aucune photo envoyee.' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const photos = files.map((file) => `${baseUrl}/uploads/${file.filename}`);
    res.status(201).json({ photos });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const {
      reference,
      titre,
      description = null,
      type_bailleur = 'membre',
      mode_annonce = 'complete',
      type_annonce = 'existante',
      type_propriete = 'appartement',
      total_colocataires = null,
      surface_totale = null,
      adresse_exacte = null,
      quartier = null,
      id_ville,
      latitude = null,
      longitude = null,
      internet = null,
      parking_voitures = 0,
      parking_motos = 0,
      parking_couvert = 0,
      services_communs = null,
      chambres = null,
      services = [],
      regles = [],
      photos = [],
    } = req.body;
    const photoUrls = Array.isArray(photos) ? photos.filter((p) => typeof p === 'string') : [];

    if (!titre || !id_ville) {
      return res.status(400).json({ message: 'Titre et ville requis.' });
    }

    const ref = reference || `CK-${Date.now().toString().slice(-8)}`;
    const annonceId = await insertAndGetId(
      `
      INSERT INTO annonces
      (id_utilisateur, reference, titre, description, statut, type_bailleur, mode_annonce, type_annonce,
       type_propriete, total_colocataires, surface_totale, adresse_exacte, quartier, id_ville, latitude,
       longitude, internet, parking_voitures, parking_motos, parking_couvert, services_communs)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        ref,
        titre,
        description,
        type_bailleur,
        mode_annonce,
        type_annonce,
        type_propriete,
        total_colocataires,
        surface_totale,
        adresse_exacte,
        quartier,
        id_ville,
        latitude,
        longitude,
        internet,
        parking_voitures,
        parking_motos,
        parking_couvert,
        services_communs ? JSON.stringify(services_communs) : null,
      ]
    );

    if (chambres) {
      const ch = chambres;
      await query(
        `
        INSERT INTO chambres
        (id_annonce, surface, est_meuble, prix_meubles, description_meubles, prix_loyer, prix_charges, type_garantie, montant_garantie, date_disponibilite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          annonceId,
          ch.surface || null,
          ch.est_meuble || null,
          ch.prix_meubles || null,
          ch.description_meubles || null,
          ch.prix_loyer,
          ch.prix_charges || null,
          ch.type_garantie || '1mois',
          ch.montant_garantie || null,
          ch.date_disponibilite,
        ]
      );
    }

    for (const amenity of services) {
      await query('INSERT INTO equipements_annonces (id_annonce, amenity) VALUES (?, ?)', [annonceId, amenity]);
    }
    for (const regle of regles) {
      await query('INSERT INTO regles_annonces (id_annonce, regle) VALUES (?, ?)', [annonceId, regle]);
    }
    for (let i = 0; i < photoUrls.length; i += 1) {
      await query('INSERT INTO photos_annonces (id_annonce, url, est_principale, ordre) VALUES (?, ?, ?, ?)', [
        annonceId,
        photoUrls[i],
        i === 0 ? 1 : 0,
        i,
      ]);
    }

    const created = await getByIdInternal(annonceId);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const allowed = [
      'titre', 'description', 'statut', 'type_bailleur', 'mode_annonce', 'type_annonce',
      'type_propriete', 'total_colocataires', 'surface_totale', 'adresse_exacte', 'quartier',
      'id_ville', 'latitude', 'longitude', 'internet', 'parking_voitures', 'parking_motos',
      'parking_couvert', 'services_communs', 'date_publication', 'date_expiration', 'booster'
    ];
    const sets = [];
    const values = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(field === 'services_communs' && typeof req.body[field] === 'object'
          ? JSON.stringify(req.body[field])
          : req.body[field]);
      }
    }
    if (sets.length === 0 && req.body.chambres === undefined && req.body.services === undefined && req.body.regles === undefined && req.body.photos === undefined) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }

    if (sets.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE annonces SET ${sets.join(', ')} WHERE id_annonce = ?`, values);
    }

    if (req.body.chambres !== undefined && req.body.chambres !== null) {
      const chambre = req.body.chambres;
      const existing = await query('SELECT id_chambre FROM chambres WHERE id_annonce = ? LIMIT 1', [req.params.id]);
      if (existing.length > 0) {
        await query(
          `UPDATE chambres SET surface = ?, est_meuble = ?, prix_meubles = ?, description_meubles = ?, prix_loyer = ?, prix_charges = ?, type_garantie = ?, montant_garantie = ?, date_disponibilite = ? WHERE id_annonce = ?`,
          [
            chambre.surface ?? null,
            chambre.est_meuble ?? null,
            chambre.prix_meubles ?? null,
            chambre.description_meubles ?? null,
            chambre.prix_loyer ?? null,
            chambre.prix_charges ?? null,
            chambre.type_garantie ?? '1mois',
            chambre.montant_garantie ?? null,
            chambre.date_disponibilite ?? null,
            req.params.id,
          ]
        );
      } else {
        await query(
          `INSERT INTO chambres (id_annonce, surface, est_meuble, prix_meubles, description_meubles, prix_loyer, prix_charges, type_garantie, montant_garantie, date_disponibilite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            chambre.surface ?? null,
            chambre.est_meuble ?? null,
            chambre.prix_meubles ?? null,
            chambre.description_meubles ?? null,
            chambre.prix_loyer ?? null,
            chambre.prix_charges ?? null,
            chambre.type_garantie ?? '1mois',
            chambre.montant_garantie ?? null,
            chambre.date_disponibilite ?? null,
          ]
        );
      }
    }

    if (Array.isArray(req.body.services)) {
      await query('DELETE FROM equipements_annonces WHERE id_annonce = ?', [req.params.id]);
      for (const amenity of req.body.services) {
        await query('INSERT INTO equipements_annonces (id_annonce, amenity) VALUES (?, ?)', [req.params.id, amenity]);
      }
    }

    if (Array.isArray(req.body.regles)) {
      await query('DELETE FROM regles_annonces WHERE id_annonce = ?', [req.params.id]);
      for (const regle of req.body.regles) {
        await query('INSERT INTO regles_annonces (id_annonce, regle) VALUES (?, ?)', [req.params.id, regle]);
      }
    }

    if (Array.isArray(req.body.photos)) {
      await query('DELETE FROM photos_annonces WHERE id_annonce = ?', [req.params.id]);
      for (let i = 0; i < req.body.photos.length; i += 1) {
        const url = req.body.photos[i];
        if (typeof url === 'string' && url.trim()) {
          await query('INSERT INTO photos_annonces (id_annonce, url, est_principale, ordre) VALUES (?, ?, ?, ?)', [req.params.id, url, i === 0 ? 1 : 0, i]);
        }
      }
    }

    const updated = await getByIdInternal(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { statut } = req.body;
    const allowedStatuses = ['pending', 'active', 'rejected', 'archived', 'expired', 'en_attente', 'refusee', 'terminee'];
    if (!statut || !allowedStatuses.includes(statut)) {
      return res.status(400).json({ message: 'Statut requis.' });
    }
    const publicationSql = statut === 'active' ? ', date_publication = COALESCE(date_publication, NOW())' : '';
    await query(
      `UPDATE annonces SET statut = ?, date_modification = NOW()${publicationSql} WHERE id_annonce = ?`,
      [statut, req.params.id]
    );
    const updated = await getByIdInternal(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await query('DELETE FROM candidature_membres WHERE id_candidature IN (SELECT id_candidature FROM candidatures WHERE id_annonce = ?)', [req.params.id]);
    await query('DELETE FROM candidatures WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM favoris WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM membres_equipes WHERE id_equipe IN (SELECT id_equipe FROM equipes WHERE id_annonce = ?)', [req.params.id]);
    await query('DELETE FROM equipes WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM demandes_ckoo WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM signalements WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM photos_annonces WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM equipements_annonces WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM regles_annonces WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM chambres WHERE id_annonce = ?', [req.params.id]);
    await query('DELETE FROM annonces WHERE id_annonce = ?', [req.params.id]);
    res.json({ message: 'Annonce supprimee.' });
  } catch (err) {
    next(err);
  }
}

async function getPhotoUrlsByAnnonce(id) {
  const rows = await query(
    `SELECT url FROM photos_annonces WHERE id_annonce = ? ORDER BY ordre, id_photo`,
    [id]
  );
  return rows.map((row) => row.url);
}

// async function getByIdInternal(id) {
//   await query('SET SESSION group_concat_max_len = 1000000');
//   const rows = await query(
//     `
//     SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
//            v.nom_ville, r.nom_region,
//            MIN(ch.surface) AS chambre_surface, MIN(ch.prix_loyer) AS prix_loyer, MIN(ch.date_disponibilite) AS date_disponibilite,
//            GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
//            GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
//            GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
//     FROM annonces a
//     JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
//     JOIN villes v ON v.id_ville = a.id_ville
//     JOIN regions r ON r.id_region = v.id_region
//     LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
//     LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
//     LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
//     LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
//     WHERE a.id_annonce = ?
//     GROUP BY a.id_annonce
//     LIMIT 1
//     `,
//     [id]
//   );
//   if (rows.length === 0) {
//     return null;
//   }
//   const annonce = mapAnnonceRow(rows[0]);
//   annonce.photos = await getPhotoUrlsByAnnonce(id);
//   return annonce;
// }

// ✅ CORRECTION : Utiliser MIN() pour les colonnes non agrégées
async function getByIdInternal(id) {
  await query('SET SESSION group_concat_max_len = 1000000');
  const rows = await query(
    `
    SELECT a.*, u.nom AS auteur_nom, u.prenom AS auteur_prenom,
           v.nom_ville, r.nom_region,
           MIN(ch.surface) AS chambre_surface, 
           MIN(ch.prix_loyer) AS prix_loyer, 
           MIN(ch.date_disponibilite) AS date_disponibilite,
           GROUP_CONCAT(DISTINCT ea.amenity ORDER BY ea.id SEPARATOR '||') AS amenities,
           GROUP_CONCAT(DISTINCT ra.regle ORDER BY ra.id SEPARATOR '||') AS rules,
           GROUP_CONCAT(DISTINCT pa.url ORDER BY pa.ordre, pa.id_photo SEPARATOR '||') AS photos
    FROM annonces a
    JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
    JOIN villes v ON v.id_ville = a.id_ville
    JOIN regions r ON r.id_region = v.id_region
    LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
    LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
    LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
    LEFT JOIN photos_annonces pa ON pa.id_annonce = a.id_annonce
    WHERE a.id_annonce = ?
    GROUP BY a.id_annonce
    LIMIT 1
    `,
    [id]
  );
  if (rows.length === 0) {
    return null;
  }
  const annonce = mapAnnonceRow(rows[0]);
  annonce.photos = await getPhotoUrlsByAnnonce(id);
  return annonce;
}

module.exports = { list, getById, uploadPhotos, create, update, updateStatus, remove };

