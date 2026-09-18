-- ============================================================
-- MIGRATION: 2026-09-18_groupes_discussion_annonce_cascade.sql
-- DESCRIPTION: `groupes_discussion.id_annonce` référençait `annonces`
--              sans règle ON DELETE (donc RESTRICT) : supprimer une
--              annonce ayant un groupe de discussion échouait avec une
--              erreur de clé étrangère. Toutes les autres tables liées
--              à `annonces` sont déjà en CASCADE ou SET NULL.
--              On passe cette FK en ON DELETE CASCADE (les tables
--              groupe_membres / groupe_messages / groupe_lectures
--              suivent déjà en cascade depuis groupes_discussion).
--              Également appliqué automatiquement au démarrage du
--              serveur (Config/connectDatabase.js). Sans danger à rejouer.
-- ============================================================

-- 1. Supprime la FK existante, quel que soit son nom (auto-généré en général :
--    groupes_discussion_ibfk_2).
SET @fk := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'groupes_discussion'
    AND REFERENCED_TABLE_NAME = 'annonces'
  LIMIT 1
);
SET @sql := IF(@fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE groupes_discussion DROP FOREIGN KEY `', @fk, '`'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. La recrée en cascade.
ALTER TABLE groupes_discussion
  ADD CONSTRAINT fk_groupes_discussion_annonce
  FOREIGN KEY (id_annonce) REFERENCES annonces (id_annonce) ON DELETE CASCADE;

SELECT '✅ Migration 2026-09-18_groupes_discussion_annonce_cascade terminée avec succès' AS status;
