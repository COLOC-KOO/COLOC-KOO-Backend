function mapUserRow(row) {
  const roleLabel = toPublicRole(row.nom_role);
  return {
    id: row.id_utilisateur,
    email: row.email,
    telephone: row.telephone,
    nom: row.nom,
    prenom: row.prenom,
    name: `${row.prenom} ${row.nom}`.trim(),
    initials: `${(row.prenom || '').charAt(0)}${(row.nom || '').charAt(0)}`.toUpperCase(),
    role: row.nom_role,
    poste: roleLabel,
    roleLabel,
    avatar: row.profile_picture,
    profilePicture: row.profile_picture,
    age: row.age,
    bio: row.bio,
    profession: row.profession,
    dateNaissance: row.date_naissance,
    villeActuelle: row.ville_actuelle_nom || row.ville_actuelle,
    villeOrigine: row.ville_origine_nom || row.ville_origine,
    languePreferee: row.langue_preferee,
    verification: Boolean(row.est_verifie),
    statut: row.statut,
    createdAt: row.date_inscription,
  };
}

function toPublicRole(role) {
  const map = {
    super_admin: 'superadmin',
    admin: 'admin',
    moderator: 'moderateur',
    proprio: 'proprietaire',
    coloc: 'colocataire',
    agent: 'admin',
  };
  return map[role] || role || 'colocataire';
}

function splitPipe(value) {
  if (!value) return [];
  return String(value)
    .split('||')
    .map(v => v.trim())
    .filter(Boolean);
}

function mapAnnonceRow(row) {
  return {
    id: row.id_annonce,
    reference: row.reference,
    titre: row.titre,
    description: row.description,
    statut: row.statut,
    type_bailleur: row.type_bailleur,
    mode_annonce: row.mode_annonce,
    type_annonce: row.type_annonce,
    type_propriete: row.type_propriete,
    total_colocataires: row.total_colocataires,
    candidature_count: row.candidature_count != null ? Number(row.candidature_count) : 0,
    surface_totale: row.surface_totale,
    adresse_exacte: row.adresse_exacte,
    quartier: row.quartier,
    ville: row.nom_ville,
    region: row.nom_region,
    id_ville: row.id_ville,
    latitude: row.latitude,
    longitude: row.longitude,
    internet: row.internet,
    parking_voitures: row.parking_voitures,
    parking_motos: row.parking_motos,
    parking_couvert: Boolean(row.parking_couvert),
    services_communs: parseJsonMaybe(row.services_communs),
    date_creation: row.date_creation,
    date_modification: row.date_modification,
    date_publication: row.date_publication,
    date_expiration: row.date_expiration,
    booster: Boolean(row.booster),
    auteur: row.auteur_prenom ? `${row.auteur_prenom} ${row.auteur_nom}`.trim() : row.auteur_nom,
    chambre: row.prix_loyer ? {
      surface: row.chambre_surface,
      prix_loyer: row.prix_loyer,
      date_disponibilite: row.date_disponibilite,
    } : null,
    id_utilisateur: row.id_utilisateur,
    services: splitPipe(row.amenities),
    regles: splitPipe(row.rules),
    photos: splitPipe(row.photos).length ? splitPipe(row.photos) : row.first_photo ? [row.first_photo] : [],
  };
}

async function hydrateAnnonce(id) {
  return {
    equipes: [],
    candidatures: [],
    favoris_count: 0,
  };
}

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

module.exports = {
  mapUserRow,
  mapAnnonceRow,
  hydrateAnnonce,
  splitPipe,
  parseJsonMaybe,
  toPublicRole,
};
