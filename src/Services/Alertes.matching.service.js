const { query } = require('./db.service');
const notify = require('./notify.service');

/**
 * Normalise une chaîne pour comparaison : minuscules + accents retirés.
 * Évite les faux négatifs du type "Créé" vs "cree", "Ivandry " vs "ivandry".
 */
function normaliser(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Le frontend (TabAlertes.tsx) enregistre des libellés français lisibles
// dans recherches_sauvegardees.type_annonce, alors que annonces.type_annonce
// est un enum technique ('existante' | 'creation'). On traduit ici.
const TYPE_ANNONCE_LABEL_VERS_CODE = {
  [normaliser('Colocation existante')]: 'existante',
  [normaliser("Création d'une colocation")]: 'creation',
  // "Bien immobilier potentiel" n'a pas d'équivalent direct dans l'enum
  // annonces.type_annonce : on ne filtre pas dessus (traité comme "tout accepter").
};

// Idem pour les règles de coloc : le frontend envoie des libellés français,
// alors que annonces stocke des colonnes booléennes dédiées.
const REGLE_LABEL_VERS_COLONNE = {
  [normaliser('Fille uniquement')]: 'women_only',
  [normaliser('Garçon uniquement')]: 'men_only',
  [normaliser('Animaux acceptés')]: 'pets_allowed',
};

/**
 * Compare une annonce (devenue "active") à toutes les alertes enregistrées
 * et notifie chaque alerte correspondante, en respectant notif_push / notif_email.
 *
 * À appeler dans updateStatus() du contrôleur annonces, uniquement quand statut === 'active'.
 *
 * @param {number} idAnnonce
 * @returns {Promise<{matches: number}>}
 */
async function matchAlertesPourAnnonce(idAnnonce) {
  console.log('\n========== [MATCH DEBUG] Début matchAlertesPourAnnonce -> idAnnonce:', idAnnonce, '==========');

  await query('SET SESSION group_concat_max_len = 1000000');
  const annonceRows = await query(
    `SELECT
        a.id_annonce, a.id_ville, a.quartier, a.titre,
        a.type_propriete, a.type_annonce,
        a.pets_allowed, a.smokers_allowed, a.women_only, a.men_only,
        MIN(ch.prix_loyer) AS prix_min,
        GROUP_CONCAT(DISTINCT ea.amenity SEPARATOR '||') AS amenities,
        GROUP_CONCAT(DISTINCT ra.regle SEPARATOR '||') AS rules
     FROM annonces a
     LEFT JOIN chambres ch ON ch.id_annonce = a.id_annonce
     LEFT JOIN equipements_annonces ea ON ea.id_annonce = a.id_annonce
     LEFT JOIN regles_annonces ra ON ra.id_annonce = a.id_annonce
     WHERE a.id_annonce = ? AND a.statut = 'active'
     GROUP BY a.id_annonce`,
    [idAnnonce]
  );

  console.log('[MATCH DEBUG] Étape 1 -> annonceRows trouvées:', annonceRows.length);

  if (!annonceRows.length) {
    console.log('[MATCH DEBUG] ARRÊT -> aucune annonce active trouvée pour cet id.');
    return { matches: 0 };
  }

  const annonce = annonceRows[0];
  console.log('[MATCH DEBUG] Étape 1 -> annonce récupérée:', JSON.stringify(annonce, null, 2));

  const amenitiesAnnonce = (annonce.amenities || '').split('||').filter(Boolean);
  const rulesTexteAnnonce = (annonce.rules || '').split('||').filter(Boolean);

  // 2. Présélectionner les alertes candidates en SQL.
  // NB: on NE filtre PLUS sur type_annonce en SQL, car les valeurs stockées
  // par le frontend (libellés français) ne correspondent pas à l'enum
  // technique de annonces.type_annonce. La traduction + le filtre se font
  // en JS à l'étape 3 (voir TYPE_ANNONCE_LABEL_VERS_CODE).
  const candidates = await query(
    `SELECT *
       FROM recherches_sauvegardees
      WHERE id_ville = ?
        AND (prix_max IS NULL OR ? IS NULL OR prix_max >= ?)
        AND (type_propriete IS NULL OR FIND_IN_SET(?, type_propriete))`,
    [
      annonce.id_ville,
      annonce.prix_min, annonce.prix_min,
      annonce.type_propriete,
    ]
  );

  console.log('[MATCH DEBUG] Étape 2 -> candidats trouvés par SQL (avant filtre type_annonce/regles):', candidates.length);
  candidates.forEach((c, i) => {
    console.log(`[MATCH DEBUG]   candidat[${i}] id=${c.id} id_utilisateur=${c.id_utilisateur} quartier=${c.quartier} prix_max=${c.prix_max} type_propriete=${c.type_propriete} type_annonce=${c.type_annonce} regles=${c.regles} commodites=${c.commodites}`);
  });

  if (!candidates.length) {
    console.log('[MATCH DEBUG] ARRÊT -> aucun candidat après le filtre SQL. Vérifie id_ville / prix_max / type_propriete dans recherches_sauvegardees.');
    return { matches: 0 };
  }

  // 3. Affiner en JS les critères difficiles à exprimer en SQL
  const reglesAnnonceMap = {
    pets_allowed: !!annonce.pets_allowed,
    smokers_allowed: !!annonce.smokers_allowed,
    women_only: !!annonce.women_only,
    men_only: !!annonce.men_only,
  };
  console.log('[MATCH DEBUG] Étape 3 -> reglesAnnonceMap:', reglesAnnonceMap);

  const amenitiesAnnonceLower = amenitiesAnnonce.map((a) => normaliser(a));
  const rulesTexteAnnonceLower = rulesTexteAnnonce.map((r) => normaliser(r));

  const alertesMatchees = candidates.filter((alerte) => {
    console.log(`\n[MATCH DEBUG] --- Vérification alerte id=${alerte.id} (id_utilisateur=${alerte.id_utilisateur}) ---`);

    // Quartier
    if (alerte.quartier && annonce.quartier) {
      const match = normaliser(alerte.quartier) === normaliser(annonce.quartier);
      console.log(`[MATCH DEBUG] Quartier -> alerte="${alerte.quartier}" vs annonce="${annonce.quartier}" -> match=${match}`);
      if (!match) {
        console.log('[MATCH DEBUG] REJET alerte', alerte.id, '-> quartier ne correspond pas');
        return false;
      }
    } else {
      console.log('[MATCH DEBUG] Quartier -> pas de filtre (vide côté alerte ou annonce)');
    }

    // Type d'annonce : traduction des libellés FR -> code technique
    // (type_annonce stocké en texte séparé par virgules, ex: "Colocation existante,Bien immobilier potentiel")
    if (alerte.type_annonce) {
      const labelsAlerte = String(alerte.type_annonce).split(',').map((s) => s.trim()).filter(Boolean);
      const codesConnus = labelsAlerte
        .map((label) => TYPE_ANNONCE_LABEL_VERS_CODE[normaliser(label)])
        .filter(Boolean); // enlève les labels sans équivalent (ex: "Bien immobilier potentiel")

      console.log('[MATCH DEBUG] type_annonce alerte (libellés):', labelsAlerte, '-> codes traduits:', codesConnus);

      if (codesConnus.length > 0) {
        const match = codesConnus.includes(annonce.type_annonce);
        console.log(`[MATCH DEBUG] type_annonce -> annonce="${annonce.type_annonce}" présent dans codes traduits=${match}`);
        if (!match) {
          console.log('[MATCH DEBUG] REJET alerte', alerte.id, '-> type_annonce ne correspond pas');
          return false;
        }
      } else {
        console.log('[MATCH DEBUG] type_annonce -> aucun libellé traduisible (ex: "Bien immobilier potentiel"), filtre ignoré');
      }
    }

    // Règles : traduction des libellés FR -> colonne booléenne, sinon recherche texte libre
    const reglesAlerte = parseListeOuJson(alerte.regles);
    console.log('[MATCH DEBUG] Règles demandées par alerte:', reglesAlerte);
    for (const regleBrute of reglesAlerte) {
      const colonne = REGLE_LABEL_VERS_COLONNE[normaliser(regleBrute)];
      if (colonne) {
        console.log(`[MATCH DEBUG] Règle "${regleBrute}" -> colonne "${colonne}" -> valeur annonce=${reglesAnnonceMap[colonne]}`);
        if (reglesAnnonceMap[colonne] !== true) {
          console.log('[MATCH DEBUG] REJET alerte', alerte.id, `-> règle "${regleBrute}" (colonne ${colonne}) non satisfaite`);
          return false;
        }
      } else {
        // Règle sans mapping connu : recherche texte libre dans regles_annonces
        const present = rulesTexteAnnonceLower.includes(normaliser(regleBrute));
        console.log(`[MATCH DEBUG] Règle texte libre "${regleBrute}" -> présente dans annonce=${present} (liste: ${rulesTexteAnnonceLower.join(', ')})`);
        if (!present) {
          console.log('[MATCH DEBUG] REJET alerte', alerte.id, `-> règle texte "${regleBrute}" absente de l'annonce`);
          return false;
        }
      }
    }

    // Commodités
    const commoditesAlerte = parseListeOuJson(alerte.commodites);
    console.log('[MATCH DEBUG] Commodités demandées par alerte:', commoditesAlerte);
    for (const commodite of commoditesAlerte) {
      const present = amenitiesAnnonceLower.includes(normaliser(commodite));
      console.log(`[MATCH DEBUG] Commodité "${commodite}" -> présente dans annonce=${present} (liste: ${amenitiesAnnonceLower.join(', ')})`);
      if (!present) {
        console.log('[MATCH DEBUG] REJET alerte', alerte.id, `-> commodité "${commodite}" absente de l'annonce`);
        return false;
      }
    }

    console.log('[MATCH DEBUG] MATCH alerte', alerte.id, '-> tous les critères sont satisfaits');
    return true;
  });

  console.log('\n[MATCH DEBUG] Étape 3 -> alertes matchées après filtre JS:', alertesMatchees.length);

  // 4. Notifier chaque alerte correspondante en respectant notif_push / notif_email
  const lien = `/annonces/${annonce.id_annonce}`;
  const titre = 'Nouvelle annonce correspondant à votre alerte';
  const texte = `Une nouvelle annonce ("${annonce.titre}") vient d'être publiée et correspond aux critères de votre alerte enregistrée.`;

  for (const alerte of alertesMatchees) {
    console.log(`[MATCH DEBUG] Étape 4 -> notification alerte id=${alerte.id} -> notif_push=${alerte.notif_push} notif_email=${alerte.notif_email}`);

    if (alerte.notif_push && alerte.notif_email) {
      await notify.notifyUser(alerte.id_utilisateur, {
        titre, texte, lien, type: 'systeme', intro: texte,
        action: { label: 'Voir l’annonce', path: lien },
      });
    } else if (alerte.notif_push) {
      await notify.insertInApp(alerte.id_utilisateur, 'systeme', titre, texte, lien);
    } else if (alerte.notif_email) {
      // Email uniquement : PAS d'entree in-app, sinon on notifierait
      // par push alors que l'utilisateur ne l'a pas demande.
      await notify.sendEmailOnly(alerte.id_utilisateur, {
        titre, texte, lien, intro: texte,
        action: { label: 'Voir l’annonce', path: lien },
      });
    } else {
      console.log('[MATCH DEBUG] Étape 4 -> alerte', alerte.id, ': notif_push=false ET notif_email=false, rien envoyé (voulu)');
    }
  }

  console.log('========== [MATCH DEBUG] Fin matchAlertesPourAnnonce -> matches:', alertesMatchees.length, '==========\n');

  return { matches: alertesMatchees.length };
}

// Le champ peut être soit une liste JSON (ancien format), soit une simple
// chaîne "a,b,c" (format actuel envoyé par TabAlertes.tsx pour certains
// champs). On gère les deux pour ne rien casser.
function parseListeOuJson(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const str = String(value).trim();
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = { matchAlertesPourAnnonce };