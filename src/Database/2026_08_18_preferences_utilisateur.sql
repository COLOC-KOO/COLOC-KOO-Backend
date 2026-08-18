CREATE TABLE IF NOT EXISTS `preferences_utilisateur` (
  `id_utilisateur` INT NOT NULL,
  `mode_defaut` VARCHAR(10) NOT NULL DEFAULT 'push',
  `evenements` JSON DEFAULT NULL,
  `date_mise_a_jour` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id_utilisateur`),
  
  CONSTRAINT `fk_preferences_utilisateur` 
    FOREIGN KEY (`id_utilisateur`) 
    REFERENCES `utilisateurs` (`id_utilisateur`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;