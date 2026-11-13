/* Create the contract-document table if the application has not initialized it yet. */
CREATE TABLE IF NOT EXISTS `demandes_documents_contractuels` (
  `id_demande` INT NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(32) NOT NULL,
  `id_utilisateur` INT NOT NULL,
  `type_document` ENUM('contrat','edl') NOT NULL,
  `profil_demandeur` VARCHAR(30) NOT NULL,
  `donnees` JSON NOT NULL,
  `clauses_ids` JSON NULL,
  `clauses_snapshot` JSON NULL,
  `preuve_paiement` VARCHAR(80) NULL,
  `archive_filename` VARCHAR(80) NULL,
  `archive_sha256` CHAR(64) NULL,
  `archive_generated_at` DATETIME NULL,
  `montant` INT NOT NULL,
  `statut` ENUM('brouillon','a-verifier','en-cours','valide','refuse') NOT NULL DEFAULT 'brouillon',
  `statut_paiement` ENUM('en-attente','a-verifier','conforme','non-conforme') NOT NULL DEFAULT 'en-attente',
  `moyen_paiement` VARCHAR(80) NULL,
  `reference_operateur` VARCHAR(255) NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_modification` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_demande`),
  UNIQUE KEY `uq_documents_contractuels_reference` (`reference`),
  KEY `idx_documents_contractuels_user` (`id_utilisateur`, `date_creation`),
  KEY `idx_documents_contractuels_status` (`statut`, `statut_paiement`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* Add the archive columns only when they are not already present. */
SET @archive_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'demandes_documents_contractuels'
    AND column_name = 'archive_filename'
);
SET @archive_ddl = IF(
  @archive_column_exists = 0,
  'ALTER TABLE `demandes_documents_contractuels` ADD COLUMN `archive_filename` VARCHAR(80) NULL AFTER `preuve_paiement`',
  'SELECT 1'
);
PREPARE archive_statement FROM @archive_ddl;
EXECUTE archive_statement;
DEALLOCATE PREPARE archive_statement;

SET @archive_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'demandes_documents_contractuels'
    AND column_name = 'archive_sha256'
);
SET @archive_ddl = IF(
  @archive_column_exists = 0,
  'ALTER TABLE `demandes_documents_contractuels` ADD COLUMN `archive_sha256` CHAR(64) NULL AFTER `archive_filename`',
  'SELECT 1'
);
PREPARE archive_statement FROM @archive_ddl;
EXECUTE archive_statement;
DEALLOCATE PREPARE archive_statement;

SET @archive_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'demandes_documents_contractuels'
    AND column_name = 'archive_generated_at'
);
SET @archive_ddl = IF(
  @archive_column_exists = 0,
  'ALTER TABLE `demandes_documents_contractuels` ADD COLUMN `archive_generated_at` DATETIME NULL AFTER `archive_sha256`',
  'SELECT 1'
);
PREPARE archive_statement FROM @archive_ddl;
EXECUTE archive_statement;
DEALLOCATE PREPARE archive_statement;

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
