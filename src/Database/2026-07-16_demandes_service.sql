-- ============================================================================
--  Demandes de service (autres services Coloc'KOO : cle_service = 'service_%')
--  Nouvelle table dediee, INDEPENDANTE des annonces (contrairement a
--  demandes_ckoo qui est liee a une annonce). Enregistre la relation entre
--  un utilisateur et les services qu'il demande depuis la page publique
--  « Service ».
--
--  Une soumission = plusieurs services => on partage la meme `reference`
--  (une ligne par service demande).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `demandes_service` (
  `id_demande_service` INT(11) NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(40) NOT NULL,
  `id_utilisateur` INT(11) NOT NULL,
  `id_service` INT(11) NOT NULL,
  `quantite` INT(11) NOT NULL DEFAULT 1,
  `prix_unitaire` INT(11) NOT NULL,
  `statut` ENUM('nouvelle','en-cours','traitee','annulee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'nouvelle',
  `message` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `telephone` VARCHAR(30) COLLATE utf8mb4_unicode_ci NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_demande_service`),
  KEY `idx_ds_reference` (`reference`),
  KEY `fk_ds_utilisateur` (`id_utilisateur`),
  KEY `fk_ds_service` (`id_service`),
  CONSTRAINT `fk_ds_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  CONSTRAINT `fk_ds_service` FOREIGN KEY (`id_service`) REFERENCES `services_ckoo` (`id_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
