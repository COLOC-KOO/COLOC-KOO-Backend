ALTER TABLE `annonces`
  ADD COLUMN `energy_class` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `parking_couvert`,
  ADD COLUMN `ghg_class` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `energy_class`,
  ADD COLUMN `elevator` tinyint(1) NOT NULL DEFAULT '0' AFTER `ghg_class`,
  ADD COLUMN `pets_allowed` tinyint(1) NOT NULL DEFAULT '0' AFTER `elevator`,
  ADD COLUMN `smokers_allowed` tinyint(1) NOT NULL DEFAULT '0' AFTER `pets_allowed`,
  ADD COLUMN `women_only` tinyint(1) NOT NULL DEFAULT '0' AFTER `smokers_allowed`,
  ADD COLUMN `men_only` tinyint(1) NOT NULL DEFAULT '0' AFTER `women_only`;

ALTER TABLE `chambres`
  ADD COLUMN `bed_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `est_meuble`;