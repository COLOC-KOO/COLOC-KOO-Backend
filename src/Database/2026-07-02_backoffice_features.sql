ALTER TABLE candidatures
  MODIFY COLUMN statut ENUM('envoyee','recu','dossier','signature','convention','en_attente','acceptee','refusee','constituee') NOT NULL DEFAULT 'envoyee';

ALTER TABLE contrats
  MODIFY COLUMN statut ENUM('a-emettre','a-planifier','brouillon','emis','envoye','signe','annule') NOT NULL DEFAULT 'a-emettre';

CREATE TABLE IF NOT EXISTS journal_actions (
  id_action INT NOT NULL AUTO_INCREMENT,
  id_utilisateur INT NULL,
  action VARCHAR(80) NOT NULL,
  cible_type VARCHAR(80) NULL,
  cible_id INT NULL,
  details JSON NULL,
  date_action DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_action),
  KEY idx_journal_action_date (date_action),
  KEY idx_journal_action_type (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS objectifs_equipe (
  id_objectif INT NOT NULL AUTO_INCREMENT,
  libelle VARCHAR(255) NOT NULL,
  objectif INT NOT NULL DEFAULT 0,
  realise INT NOT NULL DEFAULT 0,
  periode ENUM('jour','semaine','mois','trimestre','annee') NOT NULL DEFAULT 'mois',
  statut ENUM('actif','termine','archive') NOT NULL DEFAULT 'actif',
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_objectif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configuration_backoffice (
  cle VARCHAR(120) NOT NULL,
  valeur JSON NULL,
  date_modification DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
