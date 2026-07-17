-- ============================================================
-- MIGRATION: 2026-07-17_add_suivi_demandes_service.sql
-- DESCRIPTION: Ajout des colonnes de suivi à la table demandes_service
-- ============================================================

ALTER TABLE `demandes_service`
ADD COLUMN `dernier_contact` VARCHAR(100) DEFAULT NULL COMMENT 'Dernier contact (appel/mail)',
ADD COLUMN `relance` VARCHAR(100) DEFAULT NULL COMMENT 'Date de la dernière relance',
ADD COLUMN `synthese` TEXT DEFAULT NULL COMMENT 'Synthèse des échanges',
ADD COLUMN `rdv_date` DATETIME DEFAULT NULL COMMENT 'Date du RDV téléphonique',
ADD COLUMN `rdv_note` VARCHAR(255) DEFAULT NULL COMMENT 'Note du RDV';

SELECT '✅ Migration 2026-07-17_add_suivi_dmandes_service terminée avec succès' AS status;