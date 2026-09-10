-- ============================================================
-- MIGRATION: 2026-09-09_villes_unique_nom.sql
-- DESCRIPTION: `villes.nom_ville` n'avait aucune contrainte d'unicité.
--              `Database/seed.js` insère les 6 villes de base via
--              `INSERT IGNORE ... SELECT`, en comptant sur une violation
--              de contrainte unique pour ne rien faire si la ville existe
--              déjà — mais sans index unique, `INSERT IGNORE` n'ignore
--              jamais rien : chaque exécution de `npm run seed` recrée
--              un doublon de chaque ville (constaté en base : 12 lignes
--              pour 6 villes réelles, ex. deux "Antananarivo").
--              Cette migration déduplique les lignes existantes (en
--              conservant l'id_ville le plus bas par nom) puis ajoute
--              la contrainte unique pour empêcher toute récidive.
--              Sans danger à rejouer.
-- ============================================================

-- 1. Repointe les éventuelles références (annonces, utilisateurs,
--    recherches sauvegardées) des doublons vers la ligne conservée.
UPDATE annonces a
JOIN villes v_dup ON v_dup.id_ville = a.id_ville
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET a.id_ville = v_keep.id_ville;

UPDATE utilisateurs u
JOIN villes v_dup ON v_dup.id_ville = u.ville_actuelle
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET u.ville_actuelle = v_keep.id_ville;

UPDATE utilisateurs u
JOIN villes v_dup ON v_dup.id_ville = u.ville_origine
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET u.ville_origine = v_keep.id_ville;

UPDATE recherches_sauvegardees r
JOIN villes v_dup ON v_dup.id_ville = r.id_ville
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET r.id_ville = v_keep.id_ville;

-- 2. Supprime les doublons (ne garde que le plus petit id_ville par nom).
DELETE v_dup FROM villes v_dup
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville;

-- 3. Empêche toute récidive.
ALTER TABLE `villes` ADD UNIQUE KEY `uniq_villes_nom` (`nom_ville`);

SELECT '✅ Migration 2026-09-09_villes_unique_nom terminée avec succès' AS status;
