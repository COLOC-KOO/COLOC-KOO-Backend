-- Archive un PDF/A for each approved contract or inspection report.
ALTER TABLE `demandes_documents_contractuels`
  ADD COLUMN `archive_filename` VARCHAR(80) NULL AFTER `preuve_paiement`,
  ADD COLUMN `archive_sha256` CHAR(64) NULL AFTER `archive_filename`,
  ADD COLUMN `archive_generated_at` DATETIME NULL AFTER `archive_sha256`;

CREATE TABLE IF NOT EXISTS `empreintes_documents_contractuels` (
  `id_empreinte` BIGINT NOT NULL AUTO_INCREMENT,
  `id_demande` INT NOT NULL,
  `id_utilisateur` INT NOT NULL,
  `type_pdf` ENUM('copie_chiffree') NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_empreinte`),
  KEY `idx_empreintes_document` (`id_demande`, `date_creation`),
  KEY `idx_empreintes_sha256` (`sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
