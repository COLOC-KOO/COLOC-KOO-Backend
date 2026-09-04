-- Ajouter la colonne est_automatique
ALTER TABLE groupe_messages 
ADD COLUMN est_automatique TINYINT(1) DEFAULT 0 
COMMENT '0 = message normal, 1 = message automatique';

-- Vérifier que la colonne a bien été ajoutée
DESCRIBE groupe_messages;


-- migrations/20260904_add_suivi_columns.sql
-- Migration pour ajouter les colonnes de suivi
ALTER TABLE demandes_service 
ADD COLUMN dernier_contact DATETIME DEFAULT NULL,
ADD COLUMN relance TINYINT(1) DEFAULT 0,
ADD COLUMN synthese TEXT DEFAULT NULL,
ADD COLUMN rdv_date DATETIME DEFAULT NULL,
ADD COLUMN rdv_note TEXT DEFAULT NULL;

ALTER TABLE membres_equipes ADD UNIQUE KEY uniq_equipe_utilisateur (id_equipe, id_utilisateur);