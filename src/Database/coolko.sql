-- --------------------------------------------------------
-- Base de données : ColocKOO
-- --------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `ColocKOO` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ColocKOO`;

-- --------------------------------------------------------
-- Table `roles` (rôles utilisateurs - plus flexible)
-- --------------------------------------------------------
CREATE TABLE `roles` (
    `id_role` int(11) NOT NULL AUTO_INCREMENT,
    `nom_role` enum('coloc','proprio','agent','moderator','admin','super_admin') NOT NULL UNIQUE,
    `description` varchar(255) DEFAULT NULL,
    PRIMARY KEY (`id_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `langues`
-- --------------------------------------------------------
CREATE TABLE `langues` (
    `id_langue` int(11) NOT NULL AUTO_INCREMENT,
    `code_langue` char(3) NOT NULL UNIQUE, -- 'MAG', 'FR', 'ENG'
    `nom_langue` varchar(50) NOT NULL,
    PRIMARY KEY (`id_langue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `regions` (nouvelle)
-- --------------------------------------------------------
CREATE TABLE `regions` (
    `id_region` int(11) NOT NULL AUTO_INCREMENT,
    `nom_region` varchar(100) NOT NULL UNIQUE,
    PRIMARY KEY (`id_region`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `villes` (nouvelle, remplace les champs texte)
-- --------------------------------------------------------
CREATE TABLE `villes` (
    `id_ville` int(11) NOT NULL AUTO_INCREMENT,
    `nom_ville` varchar(100) NOT NULL,
    `id_region` int(11) NOT NULL,
    PRIMARY KEY (`id_ville`),
    KEY `fk_villes_region` (`id_region`),
    CONSTRAINT `fk_villes_region` FOREIGN KEY (`id_region`) REFERENCES `regions` (`id_region`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `utilisateurs` (fusion des deux schémas)
-- --------------------------------------------------------
CREATE TABLE `utilisateurs` (
    `id_utilisateur` int(11) NOT NULL AUTO_INCREMENT,
    `email` varchar(255) NOT NULL UNIQUE,
    `telephone` varchar(30) DEFAULT NULL UNIQUE, -- Ajouté depuis ColocSARINTANY
    `mot_de_passe` varchar(255) NOT NULL,
    `nom` varchar(100) NOT NULL,
    `prenom` varchar(100) NOT NULL,
    `age` int(3) DEFAULT NULL,
    `bio` text DEFAULT NULL,
    `profile_picture` varchar(255) DEFAULT NULL,
    `ville_actuelle` int(11) DEFAULT NULL, -- Nouveau, FK vers villes
    `ville_origine` int(11) DEFAULT NULL, -- Nouveau, FK vers villes
    `profession` varchar(100) DEFAULT NULL,
    `est_verifie` tinyint(1) NOT NULL DEFAULT 0,
    `statut` enum('active','inactive','suspended','banned') NOT NULL DEFAULT 'active',
    `date_suspension_fin` datetime DEFAULT NULL,
    `date_inscription` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `derniere_connexion` datetime DEFAULT NULL,
    `langue_preferee` int(11) DEFAULT 1,
    `navigation_light` tinyint(1) NOT NULL DEFAULT 0,
    `id_role` int(11) NOT NULL DEFAULT 1, -- Changement : FK vers roles
    PRIMARY KEY (`id_utilisateur`),
    KEY `idx_utilisateurs_email` (`email`),
    KEY `idx_utilisateurs_role` (`id_role`),
    KEY `fk_utilisateurs_langue` (`langue_preferee`),
    KEY `fk_utilisateurs_ville_actuelle` (`ville_actuelle`),
    KEY `fk_utilisateurs_ville_origine` (`ville_origine`),
    CONSTRAINT `fk_utilisateurs_langue` FOREIGN KEY (`langue_preferee`) REFERENCES `langues` (`id_langue`) ON DELETE SET NULL,
    CONSTRAINT `fk_utilisateurs_role` FOREIGN KEY (`id_role`) REFERENCES `roles` (`id_role`) ON DELETE RESTRICT,
    CONSTRAINT `fk_utilisateurs_ville_actuelle` FOREIGN KEY (`ville_actuelle`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL,
    CONSTRAINT `fk_utilisateurs_ville_origine` FOREIGN KEY (`ville_origine`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `annonces` (fusion des deux schémas)
-- --------------------------------------------------------
CREATE TABLE `annonces` (
    `id_annonce` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `reference` varchar(20) NOT NULL UNIQUE,
    `titre` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `statut` enum('pending','active','expired','archived','rejected','en_attente','refusee','terminee') NOT NULL DEFAULT 'pending',
    `type_bailleur` enum('membre','proprio','pro') NOT NULL,
    `mode_annonce` enum('flux','complete') NOT NULL DEFAULT 'complete',
    `type_annonce` enum('existante','creation') NOT NULL DEFAULT 'existante',
    `type_propriete` enum('appartement','maison','autre') NOT NULL DEFAULT 'appartement',
    `total_colocataires` int(11) DEFAULT NULL,
    `surface_totale` int(11) DEFAULT NULL,
    `adresse_exacte` varchar(255) DEFAULT NULL, -- Jamais affichée
    `quartier` varchar(255) DEFAULT NULL,
    `id_ville` int(11) NOT NULL, -- Changement : FK vers villes
    `latitude` decimal(10,8) DEFAULT NULL,
    `longitude` decimal(11,8) DEFAULT NULL,
    `internet` enum('ADSL','Fibre','Box','Aucune') DEFAULT NULL,
    `parking_voitures` int(11) DEFAULT 0,
    `parking_motos` int(11) DEFAULT 0,
    `parking_couvert` tinyint(1) DEFAULT 0,
    `services_communs` json DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    `date_publication` datetime DEFAULT NULL,
    `date_expiration` datetime DEFAULT NULL,
    `booster` tinyint(1) NOT NULL DEFAULT 0, -- Ajouté depuis ColocSARINTANY
    PRIMARY KEY (`id_annonce`),
    KEY `fk_annonces_utilisateur` (`id_utilisateur`),
    KEY `fk_annonces_ville` (`id_ville`),
    KEY `idx_annonces_statut` (`statut`),
    KEY `idx_annonces_date_creation` (`date_creation`),
    CONSTRAINT `fk_annonces_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
    CONSTRAINT `fk_annonces_ville` FOREIGN KEY (`id_ville`) REFERENCES `villes` (`id_ville`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `photos_annonces`
-- --------------------------------------------------------
CREATE TABLE `photos_annonces` (
    `id_photo` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `url` varchar(255) NOT NULL,
    `est_principale` tinyint(1) NOT NULL DEFAULT 0,
    `ordre` int(11) NOT NULL DEFAULT 0,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_photo`),
    KEY `fk_photos_annonce` (`id_annonce`),
    CONSTRAINT `fk_photos_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `chambres`
-- --------------------------------------------------------
CREATE TABLE `chambres` (
    `id_chambre` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `surface` int(11) DEFAULT NULL,
    `est_meuble` enum('Oui','Partiellement','Non','Rachat') DEFAULT NULL,
    `prix_meubles` int(11) DEFAULT NULL,
    `description_meubles` text DEFAULT NULL,
    `prix_loyer` int(11) NOT NULL,
    `prix_charges` int(11) DEFAULT NULL,
    `type_garantie` enum('1mois','autre') DEFAULT '1mois',
    `montant_garantie` int(11) DEFAULT NULL,
    `date_disponibilite` date NOT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_chambre`),
    KEY `fk_chambres_annonce` (`id_annonce`),
    CONSTRAINT `fk_chambres_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `equipements_annonces`
-- --------------------------------------------------------
CREATE TABLE `equipements_annonces` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `amenity` varchar(100) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `fk_equipements_annonce` (`id_annonce`),
    CONSTRAINT `fk_equipements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `regles_annonces`
-- --------------------------------------------------------
CREATE TABLE `regles_annonces` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `regle` varchar(100) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `fk_regles_annonce` (`id_annonce`),
    CONSTRAINT `fk_regles_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `favoris`
-- --------------------------------------------------------
CREATE TABLE `favoris` (
    `id_favori` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `id_annonce` int(11) NOT NULL,
    `date_ajout` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_favori`),
    UNIQUE KEY `favoris_unique` (`id_utilisateur`, `id_annonce`),
    KEY `fk_favoris_annonce` (`id_annonce`),
    CONSTRAINT `fk_favoris_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
    CONSTRAINT `fk_favoris_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `recherches_sauvegardees`
-- --------------------------------------------------------
CREATE TABLE `recherches_sauvegardees` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `nom` varchar(255) DEFAULT NULL,
    `id_ville` int(11) DEFAULT NULL,
    `quartier` varchar(100) DEFAULT NULL,
    `prix_max` int(11) DEFAULT NULL,
    `type_propriete` varchar(50) DEFAULT NULL,
    `regles` json DEFAULT NULL,
    `type_annonce` varchar(50) DEFAULT NULL,
    `est_actif` tinyint(1) NOT NULL DEFAULT 1,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `fk_recherches_utilisateur` (`id_utilisateur`),
    KEY `fk_recherches_ville` (`id_ville`),
    CONSTRAINT `fk_recherches_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
    CONSTRAINT `fk_recherches_ville` FOREIGN KEY (`id_ville`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `equipes` (pour les colocations en formation)
-- --------------------------------------------------------
CREATE TABLE `equipes` (
    `id_equipe` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `nom` varchar(255) NOT NULL,
    `ambiance` text DEFAULT NULL,
    `statut` enum('forming','complete','selected','rejected') NOT NULL DEFAULT 'forming',
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_equipe`),
    KEY `fk_equipes_annonce` (`id_annonce`),
    CONSTRAINT `fk_equipes_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `membres_equipes`
-- --------------------------------------------------------
CREATE TABLE `membres_equipes` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_equipe` int(11) NOT NULL,
    `id_utilisateur` int(11) NOT NULL,
    `statut` enum('pending','accepted','refused','left') NOT NULL DEFAULT 'pending',
    `date_ajout` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `fk_membres_equipe` (`id_equipe`),
    KEY `fk_membres_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_membres_equipe` FOREIGN KEY (`id_equipe`) REFERENCES `equipes` (`id_equipe`) ON DELETE CASCADE,
    CONSTRAINT `fk_membres_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `candidatures`
-- --------------------------------------------------------
CREATE TABLE `candidatures` (
    `id_candidature` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `id_annonce` int(11) NOT NULL,
    `message` text DEFAULT NULL,
    `statut` enum('en_attente','acceptee','refusee','constituee') NOT NULL DEFAULT 'en_attente',
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_candidature`),
    KEY `fk_candidatures_utilisateur` (`id_utilisateur`),
    KEY `fk_candidatures_annonce` (`id_annonce`),
    CONSTRAINT `fk_candidatures_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
    CONSTRAINT `fk_candidatures_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `candidature_membres`
-- --------------------------------------------------------
CREATE TABLE `candidature_membres` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_candidature` int(11) NOT NULL,
    `nom` varchar(255) NOT NULL,
    `initiales` varchar(8) DEFAULT NULL,
    `statut` enum('en_attente','accepte','refuse') NOT NULL DEFAULT 'en_attente',
    `profession` varchar(100) DEFAULT NULL,
    `age` int(11) DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `fk_candidature_membres_candidature` (`id_candidature`),
    CONSTRAINT `fk_candidature_membres_candidature` FOREIGN KEY (`id_candidature`) REFERENCES `candidatures` (`id_candidature`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `partenaires`
-- --------------------------------------------------------
CREATE TABLE `partenaires` (
    `id_partenaire` int(11) NOT NULL AUTO_INCREMENT,
    `nom` varchar(255) NOT NULL,
    `secteur` varchar(255) DEFAULT NULL,
    `niveau` enum('Bronze','Argent','Or','Diamant') NOT NULL DEFAULT 'Bronze',
    `remise` varchar(255) DEFAULT NULL,
    `engagement` text DEFAULT NULL,
    `logo` varchar(255) DEFAULT NULL,
    `actif` tinyint(1) NOT NULL DEFAULT 1,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_partenaire`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `demandes_partenaires`
-- --------------------------------------------------------
CREATE TABLE `demandes_partenaires` (
    `id_demande` int(11) NOT NULL AUTO_INCREMENT,
    `nom_entreprise` varchar(255) NOT NULL,
    `email` varchar(255) NOT NULL,
    `secteur` varchar(255) DEFAULT NULL,
    `niveau_souhaite` enum('Bronze','Argent','Or','Diamant') DEFAULT NULL,
    `message` text DEFAULT NULL,
    `statut` enum('en_attente','acceptee','refusee') NOT NULL DEFAULT 'en_attente',
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_demande`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `messages_contact`
-- --------------------------------------------------------
CREATE TABLE `messages_contact` (
    `id_message` int(11) NOT NULL AUTO_INCREMENT,
    `nom` varchar(255) NOT NULL,
    `email` varchar(255) NOT NULL,
    `sujet` varchar(255) NOT NULL,
    `message` text NOT NULL,
    `statut` enum('new','read','closed') NOT NULL DEFAULT 'new',
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_message`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `notifications`
-- --------------------------------------------------------
CREATE TABLE `notifications` (
    `id_notification` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `type_notification` enum('message','candidature','systeme') NOT NULL DEFAULT 'systeme',
    `titre` varchar(255) NOT NULL,
    `texte` text NOT NULL,
    `lien` varchar(255) DEFAULT NULL,
    `est_lue` tinyint(1) NOT NULL DEFAULT 0,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_notification`),
    KEY `fk_notifications_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_notifications_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Donnees de base
-- --------------------------------------------------------
INSERT INTO `roles` (`nom_role`, `description`) VALUES
('coloc', 'Colocataire'),
('proprio', 'Proprietaire'),
('agent', 'Agent ou partenaire'),
('moderator', 'Moderation des annonces'),
('admin', 'Administration generale'),
('super_admin', 'Super administration')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `langues` (`code_langue`, `nom_langue`) VALUES
('FR', 'Francais'),
('MG', 'Malagasy'),
('ENG', 'English')
ON DUPLICATE KEY UPDATE `nom_langue` = VALUES(`nom_langue`);

INSERT INTO `regions` (`nom_region`) VALUES
('Analamanga'),
('Boeny'),
('Atsinanana'),
('Haute Matsiatra'),
('Vakinankaratra'),
('Diana')
ON DUPLICATE KEY UPDATE `nom_region` = VALUES(`nom_region`);

INSERT INTO `villes` (`nom_ville`, `id_region`)
SELECT 'Antananarivo', r.id_region FROM regions r WHERE r.nom_region = 'Analamanga'
UNION ALL SELECT 'Mahajanga', r.id_region FROM regions r WHERE r.nom_region = 'Boeny'
UNION ALL SELECT 'Toamasina', r.id_region FROM regions r WHERE r.nom_region = 'Atsinanana'
UNION ALL SELECT 'Fianarantsoa', r.id_region FROM regions r WHERE r.nom_region = 'Haute Matsiatra'
UNION ALL SELECT 'Antsirabe', r.id_region FROM regions r WHERE r.nom_region = 'Vakinankaratra'
UNION ALL SELECT 'Antsiranana', r.id_region FROM regions r WHERE r.nom_region = 'Diana'
ON DUPLICATE KEY UPDATE `nom_ville` = VALUES(`nom_ville`);

INSERT INTO `partenaires` (`nom`, `secteur`, `niveau`, `remise`, `engagement`, `logo`) VALUES
('BNI Madagascar', 'Banque & Finance', 'Diamant', '5% sur frais de dossier', 'Accompagnement bancaire des nouveaux colocataires', '🏦'),
('Orange Madagascar', 'Telecommunications', 'Diamant', '20% sur forfaits fibre', 'Connexion internet prioritaire pour les colocs', '📱'),
('Jirama', 'Eau & Electricite', 'Or', 'Raccordement rapide', 'Mise en service prioritaire pour les nouvelles colocs', '💡'),
('Moov Africa', 'Telecommunications', 'Or', '15% sur abonnements data', 'Offres mobiles avantageuses pour les colocataires', '📶')
ON DUPLICATE KEY UPDATE `niveau` = VALUES(`niveau`), `remise` = VALUES(`remise`), `engagement` = VALUES(`engagement`), `logo` = VALUES(`logo`);

-- --------------------------------------------------------
-- Table `messages`
-- --------------------------------------------------------
CREATE TABLE `messages` (
    `id_message` int(11) NOT NULL AUTO_INCREMENT,
    `id_expediteur` int(11) NOT NULL,
    `id_destinataire` int(11) NOT NULL,
    `id_annonce` int(11) DEFAULT NULL,
    `sujet` varchar(255) DEFAULT NULL,
    `contenu` text NOT NULL,
    `est_lu` tinyint(1) NOT NULL DEFAULT 0,
    `message_parent` int(11) DEFAULT NULL,
    `signalement_abus` tinyint(1) NOT NULL DEFAULT 0, -- Ajouté depuis ColocSARINTANY
    `date_envoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_message`),
    KEY `fk_messages_expediteur` (`id_expediteur`),
    KEY `fk_messages_destinataire` (`id_destinataire`),
    KEY `fk_messages_annonce` (`id_annonce`),
    KEY `idx_messages_date_envoi` (`date_envoi`),
    KEY `idx_messages_est_lu` (`est_lu`),
    CONSTRAINT `fk_messages_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE SET NULL,
    CONSTRAINT `fk_messages_destinataire` FOREIGN KEY (`id_destinataire`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_expediteur` FOREIGN KEY (`id_expediteur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `signalements`
-- --------------------------------------------------------
CREATE TABLE `signalements` (
    `id_signalement` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur_signalant` int(11) NOT NULL,
    `id_utilisateur_cible` int(11) DEFAULT NULL,
    `id_annonce` int(11) DEFAULT NULL,
    `id_message` int(11) DEFAULT NULL,
    `raison` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `statut` enum('new','in_progress','resolved','dismissed') NOT NULL DEFAULT 'new',
    `date_signalement` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `date_resolution` datetime DEFAULT NULL,
    PRIMARY KEY (`id_signalement`),
    KEY `fk_signalements_signaleur` (`id_utilisateur_signalant`),
    KEY `fk_signalements_utilisateur_cible` (`id_utilisateur_cible`),
    KEY `fk_signalements_annonce` (`id_annonce`),
    KEY `fk_signalements_message` (`id_message`),
    CONSTRAINT `fk_signalements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
    CONSTRAINT `fk_signalements_message` FOREIGN KEY (`id_message`) REFERENCES `messages` (`id_message`) ON DELETE CASCADE,
    CONSTRAINT `fk_signalements_signaleur` FOREIGN KEY (`id_utilisateur_signalant`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
    CONSTRAINT `fk_signalements_utilisateur_cible` FOREIGN KEY (`id_utilisateur_cible`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `contrats`
-- --------------------------------------------------------
CREATE TABLE `contrats` (
    `id_contrat` int(11) NOT NULL AUTO_INCREMENT,
    `reference` varchar(20) NOT NULL UNIQUE,
    `id_annonce` int(11) NOT NULL,
    `type` enum('contrat','edl') NOT NULL,
    `statut` enum('a-emettre','a-planifier','emis','annule') NOT NULL DEFAULT 'a-emettre',
    `montant_total` int(11) DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `date_emission` datetime DEFAULT NULL,
    PRIMARY KEY (`id_contrat`),
    KEY `fk_contrats_annonce` (`id_annonce`),
    CONSTRAINT `fk_contrats_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `parties_contrats`
-- --------------------------------------------------------
CREATE TABLE `parties_contrats` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `id_contrat` int(11) NOT NULL,
    `id_utilisateur` int(11) DEFAULT NULL,
    `nom_complet` varchar(255) DEFAULT NULL,
    `role` varchar(50) NOT NULL,
    `cin` varchar(50) DEFAULT NULL,
    `telephone` varchar(30) DEFAULT NULL,
    `email` varchar(255) DEFAULT NULL,
    `commentaire` text DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `fk_parties_contrat` (`id_contrat`),
    KEY `fk_parties_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_parties_contrat` FOREIGN KEY (`id_contrat`) REFERENCES `contrats` (`id_contrat`) ON DELETE CASCADE,
    CONSTRAINT `fk_parties_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `paiements` (fusion des deux schémas)
-- --------------------------------------------------------
CREATE TABLE `paiements` (
    `id_paiement` int(11) NOT NULL AUTO_INCREMENT,
    `reference` varchar(20) NOT NULL UNIQUE,
    `id_utilisateur` int(11) NOT NULL,
    `id_contrat` int(11) DEFAULT NULL,
    `id_annonce` int(11) DEFAULT NULL,
    `id_partenaire` int(11) DEFAULT NULL, -- Partenaire peut être NULL
    `montant_du` int(11) NOT NULL,
    `montant_recu` int(11) NOT NULL,
    `moyen_paiement` enum('MVOLA','Orange Money','Airtel Money','CB','Autre') NOT NULL, -- Fusionné
    `service_type` enum('booster','publicite','contrat','autre') NOT NULL, -- Ajouté depuis ColocSARINTANY
    `statut` enum('a-verifier','conforme','non-conforme','en_attente','valide','echoue') NOT NULL DEFAULT 'a-verifier',
    `date_paiement` date NOT NULL,
    `reference_operateur` varchar(255) DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_paiement`),
    KEY `fk_paiements_utilisateur` (`id_utilisateur`),
    KEY `fk_paiements_contrat` (`id_contrat`),
    KEY `fk_paiements_annonce` (`id_annonce`),
    KEY `idx_paiements_date` (`date_paiement`),
    KEY `idx_paiements_statut` (`statut`),
    CONSTRAINT `fk_paiements_contrat` FOREIGN KEY (`id_contrat`) REFERENCES `contrats` (`id_contrat`) ON DELETE SET NULL,
    CONSTRAINT `fk_paiements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE SET NULL,
    CONSTRAINT `fk_paiements_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `services_ckoo`
-- --------------------------------------------------------
CREATE TABLE `services_ckoo` (
    `id_service` int(11) NOT NULL AUTO_INCREMENT,
    `cle_service` varchar(50) NOT NULL UNIQUE,
    `nom` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `prix` int(11) NOT NULL,
    `unite` enum('heure','forfait','jour','mois','an','stere') NOT NULL DEFAULT 'heure',
    `est_actif` tinyint(1) NOT NULL DEFAULT 1,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `demandes_ckoo`
-- --------------------------------------------------------
CREATE TABLE `demandes_ckoo` (
    `id_demande` int(11) NOT NULL AUTO_INCREMENT,
    `id_annonce` int(11) NOT NULL,
    `id_utilisateur` int(11) NOT NULL,
    `statut` enum('a-contacter','en-cours','valide','annule') NOT NULL DEFAULT 'a-contacter',
    `historique_contact` text DEFAULT NULL,
    `synthese` text DEFAULT NULL,
    `date_rendez_vous` datetime DEFAULT NULL,
    `note_rendez_vous` text DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_demande`),
    KEY `fk_demandes_ckoo_annonce` (`id_annonce`),
    KEY `fk_demandes_ckoo_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_demandes_ckoo_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
    CONSTRAINT `fk_demandes_ckoo_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `lignes_demandes_ckoo`
-- --------------------------------------------------------
CREATE TABLE `lignes_demandes_ckoo` (
    `id_ligne` int(11) NOT NULL AUTO_INCREMENT,
    `id_demande` int(11) NOT NULL,
    `id_service` int(11) NOT NULL,
    `quantite` int(11) NOT NULL DEFAULT 1,
    `prix_unitaire` int(11) NOT NULL,
    `prix_total` int(11) GENERATED ALWAYS AS (quantite * prix_unitaire) VIRTUAL,
    PRIMARY KEY (`id_ligne`),
    KEY `fk_lignes_demande` (`id_demande`),
    KEY `fk_lignes_service` (`id_service`),
    CONSTRAINT `fk_lignes_demande` FOREIGN KEY (`id_demande`) REFERENCES `demandes_ckoo` (`id_demande`) ON DELETE CASCADE,
    CONSTRAINT `fk_lignes_service` FOREIGN KEY (`id_service`) REFERENCES `services_ckoo` (`id_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `partenaires`
-- --------------------------------------------------------
CREATE TABLE `partenaires` (
    `id_partenaire` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) DEFAULT NULL,
    `nom_entreprise` varchar(255) NOT NULL,
    `categorie` enum('Entreprise generale','Immobilier','Institution publique') NOT NULL,
    `niveau` varchar(50) DEFAULT NULL,
    `statut` enum('actif','attente','suspendu') NOT NULL DEFAULT 'attente',
    `niveau_visibilite` int(11) NOT NULL DEFAULT 0,
    `url_logo` varchar(255) DEFAULT NULL,
    `nom_contact` varchar(255) DEFAULT NULL,
    `fonction_contact` varchar(255) DEFAULT NULL,
    `telephone_contact` varchar(30) DEFAULT NULL,
    `email_contact` varchar(255) DEFAULT NULL,
    `adresse_contact` text DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_partenaire`),
    KEY `fk_partenaires_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_partenaires_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `campagnes`
-- --------------------------------------------------------
CREATE TABLE `campagnes` (
    `id_campagne` int(11) NOT NULL AUTO_INCREMENT,
    `id_partenaire` int(11) NOT NULL,
    `nom` varchar(255) NOT NULL,
    `placement` enum('encart','bandeau','carte') NOT NULL,
    `region` varchar(100) DEFAULT NULL,
    `date_debut` date DEFAULT NULL,
    `date_fin` date DEFAULT NULL,
    `url_visuel` varchar(255) DEFAULT NULL,
    `statut` enum('programmee','active','suspendue') NOT NULL DEFAULT 'programmee',
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_campagne`),
    KEY `fk_campagnes_partenaire` (`id_partenaire`),
    CONSTRAINT `fk_campagnes_partenaire` FOREIGN KEY (`id_partenaire`) REFERENCES `partenaires` (`id_partenaire`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `notifications`
-- --------------------------------------------------------
CREATE TABLE `notifications` (
    `id_notification` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `type` enum('message','alert','system','application') NOT NULL,
    `titre` varchar(255) DEFAULT NULL,
    `contenu` text NOT NULL,
    `lien` varchar(255) DEFAULT NULL,
    `est_lu` tinyint(1) NOT NULL DEFAULT 0,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_notification`),
    KEY `fk_notifications_utilisateur` (`id_utilisateur`),
    CONSTRAINT `fk_notifications_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `journaux` (logs)
-- --------------------------------------------------------
CREATE TABLE `journaux` (
    `id_journal` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) DEFAULT NULL,
    `type_action` enum('Validation','Rejet','Correction','Suspension','Message','Connexion','Moderation') NOT NULL,
    `cible` varchar(100) DEFAULT NULL,
    `details` text DEFAULT NULL,
    `adresse_ip` varchar(45) DEFAULT NULL,
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_journal`),
    KEY `fk_journaux_utilisateur` (`id_utilisateur`),
    KEY `idx_journaux_date_creation` (`date_creation`),
    KEY `idx_journaux_action` (`type_action`),
    CONSTRAINT `fk_journaux_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `preferences_utilisateurs`
-- --------------------------------------------------------
CREATE TABLE `preferences_utilisateurs` (
    `id_preference` int(11) NOT NULL AUTO_INCREMENT,
    `id_utilisateur` int(11) NOT NULL,
    `cle_preference` varchar(100) NOT NULL,
    `valeur_preference` text DEFAULT NULL,
    PRIMARY KEY (`id_preference`),
    UNIQUE KEY `preference_unique` (`id_utilisateur`, `cle_preference`),
    CONSTRAINT `fk_preferences_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table `configurations`
-- --------------------------------------------------------
CREATE TABLE `configurations` (
    `id_config` int(11) NOT NULL AUTO_INCREMENT,
    `cle_config` varchar(100) NOT NULL UNIQUE,
    `valeur_config` text DEFAULT NULL,
    `description` text DEFAULT NULL,
    `date_modification` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_config`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Données initiales
-- --------------------------------------------------------
INSERT INTO `roles` (`nom_role`, `description`) VALUES
('user', 'Utilisateur standard'),
('moderator', 'Modérateur de contenu'),
('analyst', 'Analyste de données'),
('admin', 'Administrateur système'),
('super_admin', 'Super administrateur');

INSERT INTO `langues` (`code_langue`, `nom_langue`) VALUES
('MAG', 'Malagasy'),
('FR', 'Français'),
('ENG', 'English');

INSERT INTO `regions` (`nom_region`) VALUES
('Analamanga'), ('Atsimo-Andrefana'), ('Diana'), ('Sava'),
('Haute Matsiatra'), ('Vakinankaratra'), ('Atsinanana');

INSERT INTO `villes` (`nom_ville`, `id_region`) VALUES
('Antananarivo', 1), ('Toliara', 2), ('Diego Suarez', 3), ('Sambava', 4),
('Fianarantsoa', 5), ('Antsirabe', 6), ('Toamasina', 7);

-- Création d'un utilisateur admin par défaut (mot de passe : admin123)
INSERT INTO `utilisateurs` (`email`, `telephone`, `mot_de_passe`, `nom`, `prenom`, `id_role`, `est_verifie`, `statut`) VALUES
('admin@colockoo.mg', '0320000000', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'ColocKOO', 5, 1, 'active');

-- Configuration initiale
INSERT INTO `configurations` (`cle_config`, `valeur_config`, `description`) VALUES
('listing_duration', '60', 'Durée de validité d\'une annonce en jours'),
('partner_listing_duration', '120', 'Durée de validité d\'une annonce partenaire en jours'),
('auto_validation_minutes', '60', 'Délai avant validation automatique (minutes)'),
('max_photos', '3', 'Nombre maximum de photos par annonce'),
('max_photos_size_mb', '3', 'Taille maximale par photo en Mo'),
('launch_free', 'true', 'Mode gratuit pour les annonces partenaires (true/false)'),
('min_rooms', '2', 'Nombre minimum de chambres pour une colocation');

-- Services Coloc'KOO initiaux
INSERT INTO `services_ckoo` (`cle_service`, `nom`, `description`, `prix`, `unite`) VALUES
('menage', 'Propreté (ménage, linge, etc.)', 'Service de ménage régulier', 5800, 'heure'),
('jardin', 'Jardinage', 'Entretien des espaces verts', 4500, 'heure'),
('gardien', 'Gardiennage', 'Surveillance du logement', 10800, 'heure'),
('jirama', 'Relevés Jirama et traçabilité', 'Gestion des relevés d\'eau et électricité', 9000, 'forfait'),
('travaux', 'Entretien et réalisation petits travaux', 'Petites réparations et entretien', 46400, 'forfait'),
('ramonage', 'Ramonage annuel', 'Nettoyage des conduits', 84000, 'an'),
('bois', 'Livraison annuelle de bois de chauffe', 'Livraison de bois de chauffage', 14000, 'stere');
