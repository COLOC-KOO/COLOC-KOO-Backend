CREATE TABLE IF NOT EXISTS `booster` (
  `id_booster` INT NOT NULL AUTO_INCREMENT,
  `nom` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `cle_service` VARCHAR(100) NOT NULL,
  `duree` INT UNSIGNED NOT NULL DEFAULT 1,
  `prix` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `unite` ENUM('heure', 'jour', 'semaine', 'mois') NOT NULL DEFAULT 'jour',
  `est_actif` TINYINT(1) NOT NULL DEFAULT 1,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_booster`),
  UNIQUE KEY `uq_booster_cle_service` (`cle_service`),
  KEY `idx_booster_actif` (`est_actif`),
  KEY `idx_booster_cle_service` (`cle_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `annonces`
  MODIFY COLUMN `booster` INT NULL;

ALTER TABLE `depot_annonce`
  MODIFY COLUMN `boost_service_id` INT NULL;

-- Optionnel, a executer seulement apres avoir migre le code qui n'utilise plus ces colonnes.
-- ALTER TABLE `annonces`
--   DROP COLUMN `internet`,
--   DROP COLUMN `parking_voitures`,
--   DROP COLUMN `parking_motos`,
--   DROP COLUMN `parking_couvert`,
--   DROP COLUMN `energy_class`,
--   DROP COLUMN `ghg_class`,
--   DROP COLUMN `elevator`,
--   DROP COLUMN `pets_allowed`,
--   DROP COLUMN `smokers_allowed`,
--   DROP COLUMN `women_only`,
--   DROP COLUMN `men_only`,
--   DROP COLUMN `services_communs`;
