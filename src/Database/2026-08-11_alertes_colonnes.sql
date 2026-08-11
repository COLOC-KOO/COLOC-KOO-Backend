-- Migration : 2026-08-11_alertes_colonnes.sql
-- Ajoute les colonnes necessaires aux alertes dynamiques (TabAlertes).
-- Ignorer les erreurs "Duplicate column name" si deja appliquee.

ALTER TABLE `recherches_sauvegardees` ADD COLUMN `commodites` JSON NULL;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `rayon_km` INT NULL;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `notif_push` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `notif_email` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `recherches_sauvegardees` MODIFY COLUMN `type_propriete` VARCHAR(255) NULL;
ALTER TABLE `recherches_sauvegardees` MODIFY COLUMN `type_annonce` VARCHAR(255) NULL;
