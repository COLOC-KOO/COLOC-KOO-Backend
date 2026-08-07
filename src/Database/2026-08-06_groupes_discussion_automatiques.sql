-- Messages système et fermeture des groupes liés aux candidatures.
ALTER TABLE groupes_discussion
  ADD COLUMN est_cloture TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE groupe_messages
  MODIFY COLUMN id_expediteur INT NULL,
  ADD COLUMN est_automatique TINYINT(1) NOT NULL DEFAULT 0;
