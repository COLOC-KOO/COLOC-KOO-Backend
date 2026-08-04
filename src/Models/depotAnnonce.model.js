const { query, insertAndGetId } = require('../Services/db.service');
const { getActiveBoosterId } = require('../Services/booster.service');

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function mapLogementToAnnonceType(logement) {
  const normalized = String(logement || '').toLowerCase();
  if (normalized.includes('maison') || normalized.includes('villa') || normalized.includes('chalet') || normalized.includes('cabane')) {
    return 'maison';
  }
  if (normalized.includes('autre')) return 'autre';
  return 'appartement';
}

async function findOrCreateVilleId(ville) {
  const name = String(ville || '').trim() || 'Antananarivo';
  const existing = await query('SELECT id_ville FROM villes WHERE LOWER(nom_ville) = LOWER(?) LIMIT 1', [name]);
  if (existing.length > 0) return existing[0].id_ville;

  const fallbackRegion = await query('SELECT id_region FROM regions ORDER BY id_region LIMIT 1');
  const regionId = fallbackRegion[0]?.id_region || 1;
  return insertAndGetId('INSERT INTO villes (nom_ville, id_region) VALUES (?, ?)', [name, regionId]);
}

async function createDepotAnnonce(userId, payload) {
  const rooms = Array.isArray(payload.chambres) && payload.chambres.length > 0 ? payload.chambres : [];
  const firstRoom = rooms[0] || {};
  const reference = `DPA-${Date.now().toString().slice(-8)}`;
  const idVille = await findOrCreateVilleId(payload.ville);
  const logement = String(payload.logement || 'Appartement');
  const typeAnnonce = String(payload.type_annonce || 'Location');
  const titre = `${typeAnnonce} - ${logement}${payload.quartier ? ` Ã  ${payload.quartier}` : ''}`;
  const description = payload.message || null;
  const photos = Array.isArray(payload.photos) ? payload.photos.filter((photo) => typeof photo === 'string' && photo.trim()) : [];
  const surface = toNullableNumber(payload.surface);
  const boosterId = await getActiveBoosterId(payload.boost_service_id);

  const annonceId = await insertAndGetId(
    `
    INSERT INTO annonces
    (id_utilisateur, reference, titre, description, statut, type_bailleur, mode_annonce, type_annonce,
     type_propriete, total_colocataires, surface_totale, adresse_exacte, quartier, id_ville, latitude,
     longitude, booster)
    VALUES (?, ?, ?, ?, 'pending', 'membre', 'complete', 'existante', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      reference,
      titre,
      description,
      mapLogementToAnnonceType(logement),
      payload.nombre_pieces === '10+' ? 10 : toNullableNumber(payload.nombre_pieces),
      surface,
      payload.adresse || null,
      payload.quartier || null,
      idVille,
      toNullableNumber(payload.latitude),
      toNullableNumber(payload.longitude),
      boosterId,
    ]
  );

  const depotId = await insertAndGetId(
    `
    INSERT INTO depot_annonce
    (id_annonce, id_utilisateur, reference, adresse, ville, quartier, latitude, longitude,
     type_annonce, logement, nombre_pieces, surface, commodites, regles, email, telephone_code,
     telephone, message, visite_3d, boost_service_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      annonceId,
      userId,
      reference,
      payload.adresse || null,
      payload.ville || null,
      payload.quartier || null,
      toNullableNumber(payload.latitude),
      toNullableNumber(payload.longitude),
      typeAnnonce,
      logement,
      payload.nombre_pieces || null,
      surface,
      JSON.stringify(normalizeJsonArray(payload.commodites)),
      JSON.stringify(normalizeJsonArray(payload.regles)),
      payload.email,
      payload.telephone_code || '+261',
      payload.telephone || null,
      payload.message || null,
      payload.visite_3d || null,
      boosterId,
    ]
  );

  for (const room of rooms) {
    await query(
      `
      INSERT INTO depot_annonce_chambres
      (id_depot_annonce, disponible_a_partir, loyer, charges, caution, surface, meublee)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        depotId,
        room.disponible_a_partir || new Date().toISOString().slice(0, 10),
        toNullableNumber(room.loyer) || 0,
        toNullableNumber(room.charges),
        toNullableNumber(room.caution),
        toNullableNumber(room.surface),
        room.meublee || null,
      ]
    );

    await query(
      `
      INSERT INTO chambres
      (id_annonce, surface, est_meuble, prix_loyer, prix_charges, montant_garantie, date_disponibilite)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        annonceId,
        toNullableNumber(room.surface),
        room.meublee || null,
        toNullableNumber(room.loyer) || 0,
        toNullableNumber(room.charges),
        toNullableNumber(room.caution),
        room.disponible_a_partir || new Date().toISOString().slice(0, 10),
      ]
    );
  }

  for (const amenity of normalizeJsonArray(payload.commodites)) {
    await query('INSERT INTO equipements_annonces (id_annonce, amenity) VALUES (?, ?)', [annonceId, amenity]);
  }

  for (const regle of normalizeJsonArray(payload.regles)) {
    await query('INSERT INTO regles_annonces (id_annonce, regle) VALUES (?, ?)', [annonceId, regle]);
  }

  for (let index = 0; index < photos.length; index += 1) {
    await query(
      'INSERT INTO photos_annonces (id_annonce, url, est_principale, ordre) VALUES (?, ?, ?, ?)',
      [annonceId, photos[index], index === 0 ? 1 : 0, index]
    );
  }

  return {
    id_depot_annonce: depotId,
    id_annonce: annonceId,
    reference,
  };
}

module.exports = {
  createDepotAnnonce,
};

