-- Migration : assistant contrat (maquette candidatures v4_17_3)
-- A appliquer sur la base existante `colockoo`.
-- Ajoute le type de bail + la clause de solidarite sur les contrats,
-- et enregistre le bareme de prix (parametrable super-admin) en configuration.

-- 1) Colonnes contrat manquantes pour la maquette
ALTER TABLE `contrats`
  ADD COLUMN `type_bail` ENUM('individuel','collectif') NULL AFTER `type`,
  ADD COLUMN `clause_solidarite` ENUM('avec','sans') NULL AFTER `type_bail`;

-- 2) Bareme de prix (identique aux valeurs par defaut de la maquette).
--    La table est aussi creee au runtime par ensureBackofficeSchema(), on la
--    securise ici avec CREATE TABLE IF NOT EXISTS pour que la migration soit autonome.
CREATE TABLE IF NOT EXISTS `configuration_backoffice` (
  `cle` VARCHAR(120) NOT NULL,
  `valeur` JSON NULL,
  `date_modification` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `configuration_backoffice` (`cle`, `valeur`) VALUES
  ('CONTRACT_TIERS', '[{"maxLoyer":450000,"prix":27000},{"maxLoyer":1350000,"prix":47000},{"maxLoyer":null,"prix":60000}]'),
  ('EDL_PRIX', '10000'),
  ('MOBILE_MONEY', '[{"nom":"Orange Money","numero":"0320000000","couleur":"#ff7900","hint":"Scanne ce QR code avec l''appli Orange Money, ou compose le numero."},{"nom":"MVOLA","numero":"0340000000","couleur":"#e2001a","hint":"Scanne ce QR code avec l''appli MVOLA, ou compose le numero."}]')
ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`);
