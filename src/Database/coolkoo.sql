 -- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Jun 30, 2026 at 11:47 AM
-- Server version: 5.7.39
-- PHP Version: 8.1.10

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `colockoo`
--

-- --------------------------------------------------------

--
-- Table structure for table `annonces`
--

CREATE TABLE `annonces` (
  `id_annonce` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `reference` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `statut` enum('pending','active','expired','archived','rejected','en_attente','refusee','terminee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `type_bailleur` enum('membre','proprio','pro') COLLATE utf8mb4_unicode_ci NOT NULL,
  `mode_annonce` enum('flux','complete') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'complete',
  `type_annonce` enum('existante','creation') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'existante',
  `type_propriete` enum('appartement','maison','autre') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'appartement',
  `total_colocataires` int(11) DEFAULT NULL,
  `surface_totale` int(11) DEFAULT NULL,
  `adresse_exacte` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quartier` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_ville` int(11) NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `internet` enum('ADSL','Fibre','Box','Aucune') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parking_voitures` int(11) DEFAULT '0',
  `parking_motos` int(11) DEFAULT '0',
  `parking_couvert` tinyint(1) DEFAULT '0',
  `services_communs` json DEFAULT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `date_publication` datetime DEFAULT NULL,
  `date_expiration` datetime DEFAULT NULL,
  `booster` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `candidatures`
--

CREATE TABLE `candidatures` (
  `id_candidature` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `statut` enum('en_attente','acceptee','refusee','constituee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_attente',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `candidature_membres`
--

CREATE TABLE `candidature_membres` (
  `id` int(11) NOT NULL,
  `id_candidature` int(11) NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `initiales` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `statut` enum('en_attente','accepte','refuse') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_attente',
  `profession` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chambres`
--

CREATE TABLE `chambres` (
  `id_chambre` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `surface` int(11) DEFAULT NULL,
  `est_meuble` enum('Oui','Partiellement','Non','Rachat') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prix_meubles` int(11) DEFAULT NULL,
  `description_meubles` text COLLATE utf8mb4_unicode_ci,
  `prix_loyer` int(11) NOT NULL,
  `prix_charges` int(11) DEFAULT NULL,
  `type_garantie` enum('1mois','autre') COLLATE utf8mb4_unicode_ci DEFAULT '1mois',
  `montant_garantie` int(11) DEFAULT NULL,
  `date_disponibilite` date NOT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contrats`
--

CREATE TABLE `contrats` (
  `id_contrat` int(11) NOT NULL,
  `reference` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `type` enum('contrat','edl') COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` enum('a-emettre','a-planifier','emis','annule') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a-emettre',
  `montant_total` int(11) DEFAULT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_emission` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `demandes_ckoo`
--

CREATE TABLE `demandes_ckoo` (
  `id_demande` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `statut` enum('a-contacter','en-cours','valide','annule') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a-contacter',
  `historique_contact` text COLLATE utf8mb4_unicode_ci,
  `synthese` text COLLATE utf8mb4_unicode_ci,
  `date_rendez_vous` datetime DEFAULT NULL,
  `note_rendez_vous` text COLLATE utf8mb4_unicode_ci,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `demandes_partenaires`
--

CREATE TABLE `demandes_partenaires` (
  `id_demande` int(11) NOT NULL,
  `nom_entreprise` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secteur` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `niveau_souhaite` enum('Bronze','Argent','Or','Diamant') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `statut` enum('en_attente','acceptee','refusee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en_attente',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `equipements_annonces`
--

CREATE TABLE `equipements_annonces` (
  `id` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `amenity` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `equipes`
--

CREATE TABLE `equipes` (
  `id_equipe` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ambiance` text COLLATE utf8mb4_unicode_ci,
  `statut` enum('forming','complete','selected','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'forming',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `favoris`
--

CREATE TABLE `favoris` (
  `id_favori` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `date_ajout` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `langues`
--

CREATE TABLE `langues` (
  `id_langue` int(11) NOT NULL,
  `code_langue` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom_langue` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `langues`
--

INSERT INTO `langues` (`id_langue`, `code_langue`, `nom_langue`) VALUES
(1, 'FR', 'Francais'),
(2, 'MG', 'Malagasy'),
(3, 'ENG', 'English');

-- --------------------------------------------------------

--
-- Table structure for table `lignes_demandes_ckoo`
--

CREATE TABLE `lignes_demandes_ckoo` (
  `id_ligne` int(11) NOT NULL,
  `id_demande` int(11) NOT NULL,
  `id_service` int(11) NOT NULL,
  `quantite` int(11) NOT NULL DEFAULT '1',
  `prix_unitaire` int(11) NOT NULL,
  `prix_total` int(11) GENERATED ALWAYS AS ((`quantite` * `prix_unitaire`)) VIRTUAL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `membres_equipes`
--

CREATE TABLE `membres_equipes` (
  `id` int(11) NOT NULL,
  `id_equipe` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `statut` enum('pending','accepted','refused','left') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `date_ajout` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id_message` int(11) NOT NULL,
  `id_expediteur` int(11) NOT NULL,
  `id_destinataire` int(11) NOT NULL,
  `id_annonce` int(11) DEFAULT NULL,
  `sujet` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contenu` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `est_lu` tinyint(1) NOT NULL DEFAULT '0',
  `message_parent` int(11) DEFAULT NULL,
  `signalement_abus` tinyint(1) NOT NULL DEFAULT '0',
  `date_envoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages_contact`
--

CREATE TABLE `messages_contact` (
  `id_message` int(11) NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sujet` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` enum('new','read','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id_notification` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `type_notification` enum('message','candidature','systeme') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'systeme',
  `titre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `texte` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `lien` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `est_lue` tinyint(1) NOT NULL DEFAULT '0',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `paiements`
--

CREATE TABLE `paiements` (
  `id_paiement` int(11) NOT NULL,
  `reference` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `id_contrat` int(11) DEFAULT NULL,
  `id_annonce` int(11) DEFAULT NULL,
  `id_partenaire` int(11) DEFAULT NULL,
  `montant_du` int(11) NOT NULL,
  `montant_recu` int(11) NOT NULL,
  `moyen_paiement` enum('MVOLA','Orange Money','Airtel Money','CB','Autre') COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_type` enum('booster','publicite','contrat','autre') COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` enum('a-verifier','conforme','non-conforme','en_attente','valide','echoue') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'a-verifier',
  `date_paiement` date NOT NULL,
  `reference_operateur` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `partenaires`
--

CREATE TABLE `partenaires` (
  `id_partenaire` int(11) NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secteur` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `niveau` enum('Bronze','Argent','Or','Diamant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Bronze',
  `remise` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `engagement` text COLLATE utf8mb4_unicode_ci,
  `logo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `partenaires`
--

INSERT INTO `partenaires` (`id_partenaire`, `nom`, `secteur`, `niveau`, `remise`, `engagement`, `logo`, `actif`, `date_creation`) VALUES
(1, 'BNI Madagascar', 'Banque & Finance', 'Diamant', '5% sur frais de dossier', 'Accompagnement bancaire des nouveaux colocataires', '🏦', 1, '2026-06-30 14:21:58'),
(2, 'Orange Madagascar', 'Telecommunications', 'Diamant', '20% sur forfaits fibre', 'Connexion internet prioritaire pour les colocs', '📱', 1, '2026-06-30 14:21:58'),
(3, 'Jirama', 'Eau & Electricite', 'Or', 'Raccordement rapide', 'Mise en service prioritaire pour les nouvelles colocs', '💡', 1, '2026-06-30 14:21:58'),
(4, 'Moov Africa', 'Telecommunications', 'Or', '15% sur abonnements data', 'Offres mobiles avantageuses pour les colocataires', '📶', 1, '2026-06-30 14:21:58');

-- --------------------------------------------------------

--
-- Table structure for table `parties_contrats`
--

CREATE TABLE `parties_contrats` (
  `id` int(11) NOT NULL,
  `id_contrat` int(11) NOT NULL,
  `id_utilisateur` int(11) DEFAULT NULL,
  `nom_complet` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `telephone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commentaire` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `photos_annonces`
--

CREATE TABLE `photos_annonces` (
  `id_photo` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `est_principale` tinyint(1) NOT NULL DEFAULT '0',
  `ordre` int(11) NOT NULL DEFAULT '0',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `recherches_sauvegardees`
--

CREATE TABLE `recherches_sauvegardees` (
  `id` int(11) NOT NULL,
  `id_utilisateur` int(11) NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_ville` int(11) DEFAULT NULL,
  `quartier` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prix_max` int(11) DEFAULT NULL,
  `type_propriete` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `regles` json DEFAULT NULL,
  `type_annonce` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `est_actif` tinyint(1) NOT NULL DEFAULT '1',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `regions`
--

CREATE TABLE `regions` (
  `id_region` int(11) NOT NULL,
  `nom_region` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `regions`
--

INSERT INTO `regions` (`id_region`, `nom_region`) VALUES
(1, 'Analamanga'),
(3, 'Atsinanana'),
(2, 'Boeny'),
(6, 'Diana'),
(4, 'Haute Matsiatra'),
(5, 'Vakinankaratra');

-- --------------------------------------------------------

--
-- Table structure for table `regles_annonces`
--

CREATE TABLE `regles_annonces` (
  `id` int(11) NOT NULL,
  `id_annonce` int(11) NOT NULL,
  `regle` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id_role` int(11) NOT NULL,
  `nom_role` enum('coloc','proprio','agent','moderator','admin','super_admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`id_role`, `nom_role`, `description`) VALUES
(1, 'coloc', 'Colocataire'),
(2, 'proprio', 'Proprietaire'),
(3, 'agent', 'Agent ou partenaire'),
(4, 'moderator', 'Moderation des annonces'),
(5, 'admin', 'Administration generale'),
(6, 'super_admin', 'Super administration');

-- --------------------------------------------------------

--
-- Table structure for table `services_ckoo`
--

CREATE TABLE `services_ckoo` (
  `id_service` int(11) NOT NULL,
  `cle_service` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `prix` int(11) NOT NULL,
  `unite` enum('heure','forfait','jour','mois','an','stere') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'heure',
  `est_actif` tinyint(1) NOT NULL DEFAULT '1',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `signalements`
--

CREATE TABLE `signalements` (
  `id_signalement` int(11) NOT NULL,
  `id_utilisateur_signalant` int(11) NOT NULL,
  `id_utilisateur_cible` int(11) DEFAULT NULL,
  `id_annonce` int(11) DEFAULT NULL,
  `id_message` int(11) DEFAULT NULL,
  `raison` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `statut` enum('new','in_progress','resolved','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `date_signalement` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_resolution` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `utilisateurs`
--

CREATE TABLE `utilisateurs` (
  `id_utilisateur` int(11) NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telephone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mot_de_passe` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prenom` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `age` int(3) DEFAULT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `profile_picture` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ville_actuelle` int(11) DEFAULT NULL,
  `ville_origine` int(11) DEFAULT NULL,
  `profession` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `est_verifie` tinyint(1) NOT NULL DEFAULT '0',
  `statut` enum('active','inactive','suspended','banned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `date_suspension_fin` datetime DEFAULT NULL,
  `date_inscription` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `derniere_connexion` datetime DEFAULT NULL,
  `langue_preferee` int(11) DEFAULT '1',
  `navigation_light` tinyint(1) NOT NULL DEFAULT '0',
  `id_role` int(11) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `utilisateurs`
--

INSERT INTO `utilisateurs` (`id_utilisateur`, `email`, `telephone`, `mot_de_passe`, `nom`, `prenom`, `age`, `bio`, `profile_picture`, `ville_actuelle`, `ville_origine`, `profession`, `est_verifie`, `statut`, `date_suspension_fin`, `date_inscription`, `derniere_connexion`, `langue_preferee`, `navigation_light`, `id_role`) VALUES
(1, 'fdsf@gmail.com', NULL, '$2b$10$j9Oezz/bjkaLXJ9bOFnfMOx9tm5KShUmo.Lzk7QOxfe75CkHoHP0a', 'fsdqfsdq', 'fsdqfsdq', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'active', NULL, '2026-06-30 14:22:37', NULL, 1, 0, 1),
(2, 'rakoto@gmail.com', NULL, '$2b$10$lxVcjJmXOaG.A56H4iTey.p4cliTBdizEMpyDABweQEyvsThUHCnm', 'Rakotoson', 'Rakotoson', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'active', NULL, '2026-06-30 14:24:22', NULL, 1, 0, 1),
(3, 'tyty@gmail.com', NULL, '$2b$10$YLArhUOdFvZDvcOr3RDOKuIo57DAh6BCS7jwKnm4jHxINFEIarI1K', 'FAFA', 'FAFA', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'active', NULL, '2026-06-30 14:32:15', '2026-06-30 14:32:50', 1, 0, 1),
(4, 'test@gmail.com', NULL, '$2b$10$521TfouXZpJ93coVOW2DY.Fxu77Leq.UtRvVcanyUCnJbjOXx6Uaq', 'test', 'test', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'active', NULL, '2026-06-30 14:45:04', NULL, 1, 0, 1);

-- --------------------------------------------------------

--
-- Table structure for table `villes`
--

CREATE TABLE `villes` (
  `id_ville` int(11) NOT NULL,
  `nom_ville` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_region` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `villes`
--

INSERT INTO `villes` (`id_ville`, `nom_ville`, `id_region`) VALUES
(1, 'Antananarivo', 1),
(2, 'Mahajanga', 2),
(3, 'Toamasina', 3),
(4, 'Fianarantsoa', 4),
(5, 'Antsirabe', 5),
(6, 'Antsiranana', 6);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `annonces`
--
ALTER TABLE `annonces`
  ADD PRIMARY KEY (`id_annonce`),
  ADD UNIQUE KEY `reference` (`reference`),
  ADD KEY `fk_annonces_utilisateur` (`id_utilisateur`),
  ADD KEY `fk_annonces_ville` (`id_ville`),
  ADD KEY `idx_annonces_statut` (`statut`),
  ADD KEY `idx_annonces_date_creation` (`date_creation`);

--
-- Indexes for table `candidatures`
--
ALTER TABLE `candidatures`
  ADD PRIMARY KEY (`id_candidature`),
  ADD KEY `fk_candidatures_utilisateur` (`id_utilisateur`),
  ADD KEY `fk_candidatures_annonce` (`id_annonce`);

--
-- Indexes for table `candidature_membres`
--
ALTER TABLE `candidature_membres`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_candidature_membres_candidature` (`id_candidature`);

--
-- Indexes for table `chambres`
--
ALTER TABLE `chambres`
  ADD PRIMARY KEY (`id_chambre`),
  ADD KEY `fk_chambres_annonce` (`id_annonce`);

--
-- Indexes for table `contrats`
--
ALTER TABLE `contrats`
  ADD PRIMARY KEY (`id_contrat`),
  ADD UNIQUE KEY `reference` (`reference`),
  ADD KEY `fk_contrats_annonce` (`id_annonce`);

--
-- Indexes for table `demandes_ckoo`
--
ALTER TABLE `demandes_ckoo`
  ADD PRIMARY KEY (`id_demande`),
  ADD KEY `fk_demandes_ckoo_annonce` (`id_annonce`),
  ADD KEY `fk_demandes_ckoo_utilisateur` (`id_utilisateur`);

--
-- Indexes for table `demandes_partenaires`
--
ALTER TABLE `demandes_partenaires`
  ADD PRIMARY KEY (`id_demande`);

--
-- Indexes for table `equipements_annonces`
--
ALTER TABLE `equipements_annonces`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_equipements_annonce` (`id_annonce`);

--
-- Indexes for table `equipes`
--
ALTER TABLE `equipes`
  ADD PRIMARY KEY (`id_equipe`),
  ADD KEY `fk_equipes_annonce` (`id_annonce`);

--
-- Indexes for table `favoris`
--
ALTER TABLE `favoris`
  ADD PRIMARY KEY (`id_favori`),
  ADD UNIQUE KEY `favoris_unique` (`id_utilisateur`,`id_annonce`),
  ADD KEY `fk_favoris_annonce` (`id_annonce`);

--
-- Indexes for table `langues`
--
ALTER TABLE `langues`
  ADD PRIMARY KEY (`id_langue`),
  ADD UNIQUE KEY `code_langue` (`code_langue`);

--
-- Indexes for table `lignes_demandes_ckoo`
--
ALTER TABLE `lignes_demandes_ckoo`
  ADD PRIMARY KEY (`id_ligne`),
  ADD KEY `fk_lignes_demande` (`id_demande`),
  ADD KEY `fk_lignes_service` (`id_service`);

--
-- Indexes for table `membres_equipes`
--
ALTER TABLE `membres_equipes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_membres_equipe` (`id_equipe`),
  ADD KEY `fk_membres_utilisateur` (`id_utilisateur`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id_message`),
  ADD KEY `fk_messages_expediteur` (`id_expediteur`),
  ADD KEY `fk_messages_destinataire` (`id_destinataire`),
  ADD KEY `fk_messages_annonce` (`id_annonce`),
  ADD KEY `idx_messages_date_envoi` (`date_envoi`),
  ADD KEY `idx_messages_est_lu` (`est_lu`);

--
-- Indexes for table `messages_contact`
--
ALTER TABLE `messages_contact`
  ADD PRIMARY KEY (`id_message`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id_notification`),
  ADD KEY `fk_notifications_utilisateur` (`id_utilisateur`);

--
-- Indexes for table `paiements`
--
ALTER TABLE `paiements`
  ADD PRIMARY KEY (`id_paiement`),
  ADD UNIQUE KEY `reference` (`reference`),
  ADD KEY `fk_paiements_utilisateur` (`id_utilisateur`),
  ADD KEY `fk_paiements_contrat` (`id_contrat`),
  ADD KEY `fk_paiements_annonce` (`id_annonce`),
  ADD KEY `idx_paiements_date` (`date_paiement`),
  ADD KEY `idx_paiements_statut` (`statut`);

--
-- Indexes for table `partenaires`
--
ALTER TABLE `partenaires`
  ADD PRIMARY KEY (`id_partenaire`);

--
-- Indexes for table `parties_contrats`
--
ALTER TABLE `parties_contrats`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_parties_contrat` (`id_contrat`),
  ADD KEY `fk_parties_utilisateur` (`id_utilisateur`);

--
-- Indexes for table `photos_annonces`
--
ALTER TABLE `photos_annonces`
  ADD PRIMARY KEY (`id_photo`),
  ADD KEY `fk_photos_annonce` (`id_annonce`);

--
-- Indexes for table `recherches_sauvegardees`
--
ALTER TABLE `recherches_sauvegardees`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_recherches_utilisateur` (`id_utilisateur`),
  ADD KEY `fk_recherches_ville` (`id_ville`);

--
-- Indexes for table `regions`
--
ALTER TABLE `regions`
  ADD PRIMARY KEY (`id_region`),
  ADD UNIQUE KEY `nom_region` (`nom_region`);

--
-- Indexes for table `regles_annonces`
--
ALTER TABLE `regles_annonces`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_regles_annonce` (`id_annonce`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id_role`),
  ADD UNIQUE KEY `nom_role` (`nom_role`);

--
-- Indexes for table `services_ckoo`
--
ALTER TABLE `services_ckoo`
  ADD PRIMARY KEY (`id_service`),
  ADD UNIQUE KEY `cle_service` (`cle_service`);

--
-- Indexes for table `signalements`
--
ALTER TABLE `signalements`
  ADD PRIMARY KEY (`id_signalement`),
  ADD KEY `fk_signalements_signaleur` (`id_utilisateur_signalant`),
  ADD KEY `fk_signalements_utilisateur_cible` (`id_utilisateur_cible`),
  ADD KEY `fk_signalements_annonce` (`id_annonce`),
  ADD KEY `fk_signalements_message` (`id_message`);

--
-- Indexes for table `utilisateurs`
--
ALTER TABLE `utilisateurs`
  ADD PRIMARY KEY (`id_utilisateur`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `telephone` (`telephone`),
  ADD KEY `idx_utilisateurs_email` (`email`),
  ADD KEY `idx_utilisateurs_role` (`id_role`),
  ADD KEY `fk_utilisateurs_langue` (`langue_preferee`),
  ADD KEY `fk_utilisateurs_ville_actuelle` (`ville_actuelle`),
  ADD KEY `fk_utilisateurs_ville_origine` (`ville_origine`);

--
-- Indexes for table `villes`
--
ALTER TABLE `villes`
  ADD PRIMARY KEY (`id_ville`),
  ADD KEY `fk_villes_region` (`id_region`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `annonces`
--
ALTER TABLE `annonces`
  MODIFY `id_annonce` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `candidatures`
--
ALTER TABLE `candidatures`
  MODIFY `id_candidature` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `candidature_membres`
--
ALTER TABLE `candidature_membres`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chambres`
--
ALTER TABLE `chambres`
  MODIFY `id_chambre` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contrats`
--
ALTER TABLE `contrats`
  MODIFY `id_contrat` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `demandes_ckoo`
--
ALTER TABLE `demandes_ckoo`
  MODIFY `id_demande` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `demandes_partenaires`
--
ALTER TABLE `demandes_partenaires`
  MODIFY `id_demande` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `equipements_annonces`
--
ALTER TABLE `equipements_annonces`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `equipes`
--
ALTER TABLE `equipes`
  MODIFY `id_equipe` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `favoris`
--
ALTER TABLE `favoris`
  MODIFY `id_favori` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `langues`
--
ALTER TABLE `langues`
  MODIFY `id_langue` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `lignes_demandes_ckoo`
--
ALTER TABLE `lignes_demandes_ckoo`
  MODIFY `id_ligne` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `membres_equipes`
--
ALTER TABLE `membres_equipes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id_message` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `messages_contact`
--
ALTER TABLE `messages_contact`
  MODIFY `id_message` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id_notification` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `paiements`
--
ALTER TABLE `paiements`
  MODIFY `id_paiement` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `partenaires`
--
ALTER TABLE `partenaires`
  MODIFY `id_partenaire` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `parties_contrats`
--
ALTER TABLE `parties_contrats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `photos_annonces`
--
ALTER TABLE `photos_annonces`
  MODIFY `id_photo` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `recherches_sauvegardees`
--
ALTER TABLE `recherches_sauvegardees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `regions`
--
ALTER TABLE `regions`
  MODIFY `id_region` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `regles_annonces`
--
ALTER TABLE `regles_annonces`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id_role` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `services_ckoo`
--
ALTER TABLE `services_ckoo`
  MODIFY `id_service` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `signalements`
--
ALTER TABLE `signalements`
  MODIFY `id_signalement` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `utilisateurs`
--
ALTER TABLE `utilisateurs`
  MODIFY `id_utilisateur` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `villes`
--
ALTER TABLE `villes`
  MODIFY `id_ville` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `annonces`
--
ALTER TABLE `annonces`
  ADD CONSTRAINT `fk_annonces_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_annonces_ville` FOREIGN KEY (`id_ville`) REFERENCES `villes` (`id_ville`);

--
-- Constraints for table `candidatures`
--
ALTER TABLE `candidatures`
  ADD CONSTRAINT `fk_candidatures_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_candidatures_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `candidature_membres`
--
ALTER TABLE `candidature_membres`
  ADD CONSTRAINT `fk_candidature_membres_candidature` FOREIGN KEY (`id_candidature`) REFERENCES `candidatures` (`id_candidature`) ON DELETE CASCADE;

--
-- Constraints for table `chambres`
--
ALTER TABLE `chambres`
  ADD CONSTRAINT `fk_chambres_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `contrats`
--
ALTER TABLE `contrats`
  ADD CONSTRAINT `fk_contrats_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `demandes_ckoo`
--
ALTER TABLE `demandes_ckoo`
  ADD CONSTRAINT `fk_demandes_ckoo_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_demandes_ckoo_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `equipements_annonces`
--
ALTER TABLE `equipements_annonces`
  ADD CONSTRAINT `fk_equipements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `equipes`
--
ALTER TABLE `equipes`
  ADD CONSTRAINT `fk_equipes_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `favoris`
--
ALTER TABLE `favoris`
  ADD CONSTRAINT `fk_favoris_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_favoris_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `lignes_demandes_ckoo`
--
ALTER TABLE `lignes_demandes_ckoo`
  ADD CONSTRAINT `fk_lignes_demande` FOREIGN KEY (`id_demande`) REFERENCES `demandes_ckoo` (`id_demande`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_lignes_service` FOREIGN KEY (`id_service`) REFERENCES `services_ckoo` (`id_service`);

--
-- Constraints for table `membres_equipes`
--
ALTER TABLE `membres_equipes`
  ADD CONSTRAINT `fk_membres_equipe` FOREIGN KEY (`id_equipe`) REFERENCES `equipes` (`id_equipe`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_membres_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_messages_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_messages_destinataire` FOREIGN KEY (`id_destinataire`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_messages_expediteur` FOREIGN KEY (`id_expediteur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `paiements`
--
ALTER TABLE `paiements`
  ADD CONSTRAINT `fk_paiements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_paiements_contrat` FOREIGN KEY (`id_contrat`) REFERENCES `contrats` (`id_contrat`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_paiements_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `parties_contrats`
--
ALTER TABLE `parties_contrats`
  ADD CONSTRAINT `fk_parties_contrat` FOREIGN KEY (`id_contrat`) REFERENCES `contrats` (`id_contrat`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_parties_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE SET NULL;

--
-- Constraints for table `photos_annonces`
--
ALTER TABLE `photos_annonces`
  ADD CONSTRAINT `fk_photos_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `recherches_sauvegardees`
--
ALTER TABLE `recherches_sauvegardees`
  ADD CONSTRAINT `fk_recherches_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_recherches_ville` FOREIGN KEY (`id_ville`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL;

--
-- Constraints for table `regles_annonces`
--
ALTER TABLE `regles_annonces`
  ADD CONSTRAINT `fk_regles_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE;

--
-- Constraints for table `signalements`
--
ALTER TABLE `signalements`
  ADD CONSTRAINT `fk_signalements_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_signalements_message` FOREIGN KEY (`id_message`) REFERENCES `messages` (`id_message`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_signalements_signaleur` FOREIGN KEY (`id_utilisateur_signalant`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_signalements_utilisateur_cible` FOREIGN KEY (`id_utilisateur_cible`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE;

--
-- Constraints for table `utilisateurs`
--
ALTER TABLE `utilisateurs`
  ADD CONSTRAINT `fk_utilisateurs_langue` FOREIGN KEY (`langue_preferee`) REFERENCES `langues` (`id_langue`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_utilisateurs_role` FOREIGN KEY (`id_role`) REFERENCES `roles` (`id_role`),
  ADD CONSTRAINT `fk_utilisateurs_ville_actuelle` FOREIGN KEY (`ville_actuelle`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_utilisateurs_ville_origine` FOREIGN KEY (`ville_origine`) REFERENCES `villes` (`id_ville`) ON DELETE SET NULL;

--
-- Constraints for table `villes`
--
ALTER TABLE `villes`
  ADD CONSTRAINT `fk_villes_region` FOREIGN KEY (`id_region`) REFERENCES `regions` (`id_region`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
