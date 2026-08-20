-- ============================================================
-- MIGRATION: 2026-08-19_fix_villes_id_ville_autoincrement.sql
-- DESCRIPTION: `villes.id_ville` était une clé primaire (INT) mais sans
--              AUTO_INCREMENT. Résultat : toute création d'une nouvelle
--              ville (ex: depuis le dépôt d'annonce) échouait avec
--              l'erreur MySQL "Field 'id_ville' doesn't have a default
--              value". Cette migration active l'AUTO_INCREMENT et
--              recale le compteur juste après le plus grand id existant
--              pour éviter toute collision avec des lignes déjà en base.
--              Sans danger à rejouer : ne modifie rien si déjà appliquée.
-- ============================================================

-- 1. Active AUTO_INCREMENT sur la colonne id_ville (déjà PRIMARY KEY).
ALTER TABLE `villes` MODIFY `id_ville` INT NOT NULL AUTO_INCREMENT;

-- 2. Recale le compteur d'auto-incrémentation juste après le plus grand
--    id_ville existant, pour ne jamais réutiliser un id déjà pris.
SET @next_id = (SELECT IFNULL(MAX(id_ville), 0) + 1 FROM `villes`);
SET @sql = CONCAT('ALTER TABLE `villes` AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '✅ Migration 2026-08-19_fix_villes_id_ville_autoincrement terminée avec succès' AS status;
