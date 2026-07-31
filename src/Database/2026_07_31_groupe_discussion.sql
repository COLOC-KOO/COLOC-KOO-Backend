CREATE TABLE groupes_discussion (
  id_groupe INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  id_createur INT NOT NULL,
  id_annonce INT NULL,              -- rattacher le groupe à une annonce/coloc si pertinent
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_createur) REFERENCES utilisateurs(id_utilisateur),
  FOREIGN KEY (id_annonce) REFERENCES annonces(id_annonce)
);

CREATE TABLE groupe_membres (
  id_groupe INT NOT NULL,
  id_utilisateur INT NOT NULL,
  role ENUM('admin','membre') DEFAULT 'membre',
  date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_groupe, id_utilisateur),
  FOREIGN KEY (id_groupe) REFERENCES groupes_discussion(id_groupe) ON DELETE CASCADE,
  FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE
);

CREATE TABLE groupe_messages (
  id_message INT AUTO_INCREMENT PRIMARY KEY,
  id_groupe INT NOT NULL,
  id_expediteur INT NOT NULL,
  contenu TEXT NOT NULL,
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
  signalement_abus TINYINT DEFAULT 0,
  FOREIGN KEY (id_groupe) REFERENCES groupes_discussion(id_groupe) ON DELETE CASCADE,
  FOREIGN KEY (id_expediteur) REFERENCES utilisateurs(id_utilisateur)
);

-- pour savoir ce que chaque membre a lu (compteur non-lus par groupe)
CREATE TABLE groupe_lectures (
  id_groupe INT NOT NULL,
  id_utilisateur INT NOT NULL,
  dernier_message_lu INT NULL,
  date_derniere_lecture DATETIME NULL,
  PRIMARY KEY (id_groupe, id_utilisateur),
  FOREIGN KEY (id_groupe) REFERENCES groupes_discussion(id_groupe) ON DELETE CASCADE,
  FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE
);