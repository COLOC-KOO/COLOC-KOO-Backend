const { query, insertAndGetId } = require('../Services/db.service');
const { getActiveBoosterId } = require('../Services/booster.service');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// function toNullableNumber(value) {
//   if (value === undefined || value === null || value === '') return null;
//   const numberValue = Number(value);
//   return Number.isFinite(numberValue) ? numberValue : null;
// }

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/\s+/g, '').replace(/[^\d.-]/g, '');
  const numberValue = Number(cleaned);
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

/* --- annonces.type_annonce : enum('existante','creation') --- */
const ANNONCE_TYPE_ANNONCE_VALUES = ['existante', 'creation'];
function normalizeAnnonceTypeAnnonce(value) {
  const v = String(value || '').trim();
  return ANNONCE_TYPE_ANNONCE_VALUES.includes(v) ? v : 'existante';
}

/* --- annonces.type_bailleur : enum('membre','proprio','pro') --- */
const TYPE_BAILLEUR_VALUES = ['membre', 'proprio', 'pro'];
function normalizeTypeBailleur(value) {
  const v = String(value || '').trim();
  return TYPE_BAILLEUR_VALUES.includes(v) ? v : 'membre';
}

/* --- annonces.mode_annonce : enum('flux','complete') --- */
const MODE_ANNONCE_VALUES = ['flux', 'complete'];
function normalizeModeAnnonce(value) {
  const v = String(value || '').trim();
  return MODE_ANNONCE_VALUES.includes(v) ? v : 'complete';
}

/* --- depot_annonce.type_annonce : enum différent (catégorie du bien) --- */
/* Ce formulaire ne produit que des annonces de colocation.             */
const DEPOT_TYPE_ANNONCE_DEFAULT = 'Colocation';

/* --- depot_annonce.logement : enum('Appartement','Maison','Villa','Cabane','Studio','Chalet','Autre') --- */
const DEPOT_LOGEMENT_VALUES = ['Appartement', 'Maison', 'Villa', 'Cabane', 'Studio', 'Chalet', 'Autre'];
function normalizeDepotLogement(value) {
  const v = String(value || '').trim();
  return DEPOT_LOGEMENT_VALUES.includes(v) ? v : 'Appartement';
}

/* --- chambres / depot_annonce_chambres.meublee (si enum côté DB, sinon libre) --- */
function normalizeMeublee(value) {
  const v = String(value || '').trim();
  return v || 'Non';
}

async function findOrCreateVilleId(ville) {
  const name = String(ville || '').trim() || 'Antananarivo';
  const existing = await query('SELECT id_ville FROM villes WHERE LOWER(nom_ville) = LOWER(?) LIMIT 1', [name]);
  if (existing.length > 0) return existing[0].id_ville;

  const fallbackRegion = await query('SELECT id_region FROM regions ORDER BY id_region LIMIT 1');
  const regionId = fallbackRegion[0]?.id_region || 1;
  return insertAndGetId('INSERT INTO villes (nom_ville, id_region) VALUES (?, ?)', [name, regionId]);
}

/* ------------------------------------------------------------------ */
/* Création                                                            */
/* ------------------------------------------------------------------ */

async function createDepotAnnonce(userId, payload) {
  const rooms = Array.isArray(payload.chambres) && payload.chambres.length > 0 ? payload.chambres : [];
  const reference = `DPA-${Date.now().toString().slice(-8)}`;
  const idVille = await findOrCreateVilleId(payload.ville);

  const logement = normalizeDepotLogement(payload.logement);
  const annonceTypeAnnonce = normalizeAnnonceTypeAnnonce(payload.type_annonce);
  const depotTypeAnnonce = DEPOT_TYPE_ANNONCE_DEFAULT;
  const typeBailleur = normalizeTypeBailleur(payload.extra?.role);
  const modeAnnonce = normalizeModeAnnonce(payload.extra?.mode);

  // titre : NOT NULL — toujours une valeur non vide, même si quartier absent
  const quartierPart = payload.quartier ? ` à ${payload.quartier}` : '';
  const titre = `${logement}${quartierPart}` || 'Annonce de colocation';

  const description = payload.message || null;
  const photos = Array.isArray(payload.photos) ? payload.photos.filter((photo) => typeof photo === 'string' && photo.trim()) : [];
  const surface = toNullableNumber(payload.surface);
  const boosterId = await getActiveBoosterId(payload.boost_service_id);

  // nombre_pieces : NOT NULL varchar(10) côté depot_annonce — jamais vide
  const nombrePiecesRaw = payload.nombre_pieces === '10+' ? '10' : String(payload.nombre_pieces || '').trim();
  const nombrePiecesStr = nombrePiecesRaw || '2'; // 2 = minimum légal d'une colocation
  const nombrePiecesNum = payload.nombre_pieces === '10+' ? 10 : toNullableNumber(payload.nombre_pieces);

  // email : NOT NULL — déjà validé en amont par le contrôleur, filet de sécurité ici
  const email = payload.email || 'non-renseigne@sarintany-coloc.mg';

  const annonceId = await insertAndGetId(
    `
    INSERT INTO annonces
    (id_utilisateur, reference, titre, description, statut, type_bailleur, mode_annonce, type_annonce,
     type_propriete, total_colocataires, surface_totale, adresse_exacte, quartier, id_ville, latitude,
     longitude, booster)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      reference,
      titre,
      description,
      typeBailleur,
      modeAnnonce,
      annonceTypeAnnonce,
      mapLogementToAnnonceType(logement),
      nombrePiecesNum,
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
      depotTypeAnnonce,
      logement,
      nombrePiecesStr,
      surface,
      JSON.stringify(normalizeJsonArray(payload.commodites)),
      JSON.stringify(normalizeJsonArray(payload.regles)),
      email,
      payload.telephone_code || '+261',
      payload.telephone || null,
      payload.message || null,
      payload.visite_3d || null,
      boosterId,
    ]
  );

  // for (const room of rooms) {
  //   const disponibleAPartir = room.disponible_a_partir || new Date().toISOString().slice(0, 10);
  //   const meublee = normalizeMeublee(room.meublee);
  //   const loyer = toNullableNumber(room.loyer) || 0;
  //
  //   await query(
  //     `
  //     INSERT INTO depot_annonce_chambres
  //     (id_depot_annonce, disponible_a_partir, loyer, charges, caution, surface, meublee)
  //     VALUES (?, ?, ?, ?, ?, ?, ?)
  //     `,
  //     [
  //       depotId,
  //       disponibleAPartir,
  //       loyer,
  //       toNullableNumber(room.charges),
  //       toNullableNumber(room.caution),
  //       toNullableNumber(room.surface),
  //       meublee,
  //     ]
  //   );
  //
  //   await query(
  //     `
  //     INSERT INTO chambres
  //     (id_annonce, surface, est_meuble, prix_loyer, prix_charges, montant_garantie, date_disponibilite)
  //     VALUES (?, ?, ?, ?, ?, ?, ?)
  //     `,
  //     [
  //       annonceId,
  //       toNullableNumber(room.surface),
  //       meublee,
  //       loyer,
  //       toNullableNumber(room.charges),
  //       toNullableNumber(room.caution),
  //       disponibleAPartir,
  //     ]
  //   );
  // }

  for (const room of rooms) {
    const disponibleAPartir = room.disponible_a_partir || new Date().toISOString().slice(0, 10);
    const meublee = normalizeMeublee(room.meublee);
    const loyer = toNullableNumber(room.loyer) ?? 0;
    const charges = toNullableNumber(room.charges);
    const caution = toNullableNumber(room.caution);
    const surfaceChambre = toNullableNumber(room.surface);

    await query(
        `
          INSERT INTO depot_annonce_chambres
          (id_depot_annonce, disponible_a_partir, loyer, charges, caution, surface, meublee)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          depotId,
          disponibleAPartir,
          loyer,
          charges,
          caution,
          surfaceChambre,
          meublee,
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
          surfaceChambre,
          meublee,
          loyer,
          charges,
          caution,
          disponibleAPartir,
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