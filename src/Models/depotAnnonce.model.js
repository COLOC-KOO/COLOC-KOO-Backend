const { query, insertAndGetId } = require('../Services/db.service');
const { getActiveBoosterId } = require('../Services/booster.service');

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

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
const DEPOT_TYPE_ANNONCE_DEFAULT = 'Colocation';

/* --- depot_annonce.logement : enum('Appartement','Maison','Villa','Cabane','Studio','Chalet','Autre') --- */
const DEPOT_LOGEMENT_VALUES = ['Appartement', 'Maison', 'Villa', 'Cabane', 'Studio', 'Chalet', 'Autre'];
function normalizeDepotLogement(value) {
  const v = String(value || '').trim();
  return DEPOT_LOGEMENT_VALUES.includes(v) ? v : 'Appartement';
}

/* --- NORMALISATION MEUBLE --- */
function normalizeMeublee(value) {
  if (value === true || value === 1 || value === '1') return 'Oui';
  if (value === false || value === 0 || value === '0') return 'Non';
  const v = String(value || '').trim().toLowerCase();
  if (v === 'oui' || v === 'true' || v.includes('meubl')) return 'Oui';
  if (v === 'non' || v === 'false' || v === 'non meublé' || v === 'non meuble') return 'Non';
  return v ? (v.charAt(0).toUpperCase() + v.slice(1)) : 'Non';
}

/* --- NORMALISATION INTERNET --- */
function normalizeInternet(value) {
  if (value === true || value === 1 || value === '1') return 'Wifi';
  if (value === false || value === 0 || value === '0' || value === null || value === undefined) return 'Aucune';
  const v = String(value).trim();
  if (!v || v.toLowerCase() === 'false' || v.toLowerCase() === 'non' || v.toLowerCase() === 'aucun' || v.toLowerCase() === 'aucune') {
    return 'Aucune';
  }
  if (v.toLowerCase() === 'true' || v.toLowerCase() === 'oui') return 'Wifi';
  return v;
}

/* --- NORMALISATION PARKINGS --- */
function normalizeParkingCount(value) {
  if (value === true || value === 'true' || value === 'oui' || value === 'yes') return 1;
  if (value === false || value === 'false' || value === 'non' || value === 'no' || value === null || value === undefined) return 0;
  const num = toNullableNumber(value);
  return num !== null && num >= 0 ? num : 0;
}

function normalizeParkingCouvert(value) {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0' || value === null || value === undefined) return 0;
  const v = String(value || '').trim().toLowerCase();
  if (v === 'oui' || v === 'true' || v === 'yes') return 1;
  return 0;
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
/* Création                                                           */
/* ------------------------------------------------------------------ */

async function createDepotAnnonce(userId, payload) {
  // 🟢 LOGS DÈS LE DÉBUT DE LA FONCTION
  console.log('===================================================');
  console.log('🚨 CREATE_DEPOT_ANNONCE DÉCLENCHÉE !');
  console.log('internet reçu ->', payload?.internet);
  console.log('parking_voitures reçu ->', payload?.parking_voitures);
  console.log('Toutes les clés reçues ->', payload ? Object.keys(payload) : 'aucun payload');
  console.log('===================================================');
  console.log('meublée (1ère chambre) ->', payload.chambres?.[0]?.meublee);
  const rooms = Array.isArray(payload.chambres) && payload.chambres.length > 0 ? payload.chambres : [];
  const reference = `DPA-${Date.now().toString().slice(-8)}`;
  const idVille = await findOrCreateVilleId(payload.ville);

  const logement = normalizeDepotLogement(payload.logement);
  const annonceTypeAnnonce = normalizeAnnonceTypeAnnonce(payload.type_annonce);
  const depotTypeAnnonce = DEPOT_TYPE_ANNONCE_DEFAULT;
  const typeBailleur = normalizeTypeBailleur(payload.extra?.role);
  const modeAnnonce = normalizeModeAnnonce(payload.extra?.mode);

  const quartierPart = payload.quartier ? ` à ${payload.quartier}` : '';
  const titre = `${logement}${quartierPart}` || 'Annonce de colocation';

  const description = payload.message || null;
  const photos = Array.isArray(payload.photos) ? payload.photos.filter((photo) => typeof photo === 'string' && photo.trim()) : [];
  const surface = toNullableNumber(payload.surface);
  const boosterId = await getActiveBoosterId(payload.boost_service_id);

  const nombrePiecesRaw = payload.nombre_pieces === '10+' ? '10' : String(payload.nombre_pieces || '').trim();
  const nombrePiecesStr = nombrePiecesRaw || '2';
  const nombrePiecesNum = payload.nombre_pieces === '10+' ? 10 : toNullableNumber(payload.nombre_pieces);

  const email = payload.email || 'non-renseigne@sarintany-coloc.mg';

  // Normalisation préalable des valeurs d'équipements et parkings
  const internetVal = normalizeInternet(payload.internet);
  const parkingVoituresVal = normalizeParkingCount(payload.parking_voitures);
  const parkingMotosVal = normalizeParkingCount(payload.parking_motos);
  const parkingCouvertVal = normalizeParkingCouvert(payload.parking_couvert);

  // 1. Insertion dans la table `annonces`
  const annonceId = await insertAndGetId(
    `
    INSERT INTO annonces
    (id_utilisateur, reference, titre, description, statut, type_bailleur, mode_annonce, type_annonce,
     type_propriete, total_colocataires, surface_totale, adresse_exacte, quartier, id_ville, latitude,
     longitude, internet, parking_voitures, parking_motos, parking_couvert, booster)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      internetVal,
      parkingVoituresVal,
      parkingMotosVal,
      parkingCouvertVal,
      boosterId,
    ]
  );

  // 2. Insertion dans la table `depot_annonce`
  const depotId = await insertAndGetId(
    `
    INSERT INTO depot_annonce
    (id_annonce, id_utilisateur, reference, adresse, ville, quartier, latitude, longitude,
     type_annonce, logement, nombre_pieces, surface, internet, 
     parking_voitures, parking_motos, parking_couvert,
     commodites, regles, email, telephone_code,
     telephone, message, visite_3d, boost_service_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      internetVal,
      parkingVoituresVal,
      parkingMotosVal,
      parkingCouvertVal,
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

  // 3. Insertion des chambres
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

  // 4. Équipements
  for (const amenity of normalizeJsonArray(payload.commodites)) {
    await query('INSERT INTO equipements_annonces (id_annonce, amenity) VALUES (?, ?)', [annonceId, amenity]);
  }

  // 5. Règles
  for (const regle of normalizeJsonArray(payload.regles)) {
    await query('INSERT INTO regles_annonces (id_annonce, regle) VALUES (?, ?)', [annonceId, regle]);
  }

  // 6. Photos
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