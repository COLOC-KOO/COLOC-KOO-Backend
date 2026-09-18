-- ============================================================================
-- SCHEMA COMPLET COLOC'KOO / COLOCKOO - FICHIER FUSIONNE
-- Genere le 2026-09-14 : regroupe coolkoo.sql (base) + toutes les migrations
-- datees du dossier Database/ en un seul script, dans l'ordre chronologique.
--
-- Corrections apportees lors de la fusion (par rapport aux fichiers sources) :
--  - Table `campagnes` : coolkoo.sql la creait deja en double (identique a
--    2026_07_15_campagnes.sql) et, pire, l'inserait AVANT la section
--    AUTO_INCREMENT du dump de base -> MySQL refusait ensuite de modifier
--    `partenaires.id_partenaire` (erreur 1833, colonne utilisee par une FK).
--    Elle est ici creee une seule fois, comme sa propre migration a sa
--    vraie date (2026-07-15), une fois le schema de base stabilise.
--  - 2026-07-17_alter_table_demandes_service.sql omis : c'etait une version
--    "garde-fou" (ADD COLUMN IF NOT EXISTS via SQL dynamique) du meme ajout
--    de colonnes que 2026-07-17_add_suivi_demandes_service.sql ; redondant
--    sur un run unique.
--  - 2026-08-03_unique_candidatures_signalements.sql : `DROP INDEX IF EXISTS`
--    retire (syntaxe non supportee par MySQL, erreur de syntaxe garantie).
--  - 2026-07-14_contrat_bail_paiement.sql : le second `CREATE TABLE IF NOT
--    EXISTS configuration_backoffice` retire (deja cree par
--    2026-07-02_backoffice_features.sql), seul l'INSERT du bareme est garde.
--  - 2026_08_18_preferences_utilisateur.sql : commentaire `// ajout deux
--    column` corrige en `-- ajout deux colonnes` (`//` n'est pas un
--    commentaire SQL valide, erreur de syntaxe garantie).
--  - 20226-09-04-Modification-table.sql (nom de fichier avec coquille sur
--    l'annee, replace ici a sa vraie date 2026-09-04) : la colonne
--    `groupe_messages.est_automatique` et les colonnes de suivi de
--    `demandes_service` (dernier_contact/relance/synthese/rdv_date/rdv_note)
--    ont ete retirees car deja ajoutees plus haut (2026-08-06 et 2026-07-17)
--    avec des types differents -> "Duplicate column name". Le controleur
--    demandesService.controller.js (ensureTable) confirme que ce sont bien
--    les types VARCHAR de la migration du 07-17 qui sont utilises en
--    production, pas les types (TINYINT/TEXT) de cette migration-la.
--    Seul l'ajout de la cle unique sur membres_equipes est conserve.
--  - Le SET NAMES utf8mb4 est garde actif jusqu'a la fin du fichier (les
--    instructions de restauration de charset de coolkoo.sql ont ete
--    deplacees en toute fin) pour eviter toute corruption des accents/emoji
--    presents dans les migrations suivantes.
-- ============================================================================

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
    `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_partenaire`)
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
    `url` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
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


-- ============================================================================
-- MIGRATION 2026-07-02 : 2026-07-02_auth_roles_annonces.sql
-- Roles (idempotent) + extension enum annonces.statut
-- ============================================================================
  -- Migration auth/roles/annonces.
  -- A appliquer sur une base existante si les roles ou colonnes manquent.

  INSERT INTO roles (id_role, nom_role, description) VALUES
    (1, 'coloc', 'Colocataire'),
    (2, 'proprio', 'Proprietaire'),
    (4, 'moderator', 'Moderateur'),
    (5, 'admin', 'Administrateur'),
    (6, 'super_admin', 'Super administrateur')
  ON DUPLICATE KEY UPDATE description = VALUES(description);

  ALTER TABLE annonces
    MODIFY statut enum('pending','active','expired','archived','rejected','en_attente','refusee','terminee') NOT NULL DEFAULT 'pending';


-- ============================================================================
-- MIGRATION 2026-07-02 : 2026-07-02_backoffice_features.sql
-- Enums candidatures/contrats + journal_actions + objectifs_equipe + configuration_backoffice
-- ============================================================================
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


-- ============================================================================
-- MIGRATION 2026-07-14 : 2026-07-14_contrat_bail_paiement.sql
-- Colonnes type_bail/clause_solidarite sur contrats + bareme de prix
-- (CREATE TABLE configuration_backoffice omis : deja cree ci-dessus)
-- ============================================================================
ALTER TABLE `contrats`
  ADD COLUMN `type_bail` ENUM('individuel','collectif') NULL AFTER `type`,
  ADD COLUMN `clause_solidarite` ENUM('avec','sans') NULL AFTER `type_bail`;

INSERT INTO `configuration_backoffice` (`cle`, `valeur`) VALUES
  ('CONTRACT_TIERS', '[{"maxLoyer":450000,"prix":27000},{"maxLoyer":1350000,"prix":47000},{"maxLoyer":null,"prix":60000}]'),
  ('EDL_PRIX', '10000'),
  ('MOBILE_MONEY', '[{"nom":"Orange Money","numero":"0320000000","couleur":"#ff7900","hint":"Scanne ce QR code avec l''appli Orange Money, ou compose le numero."},{"nom":"MVOLA","numero":"0340000000","couleur":"#e2001a","hint":"Scanne ce QR code avec l''appli MVOLA, ou compose le numero."}]')
ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`);

-- ============================================================================
-- MIGRATION 2026-07-15 : 2026_07_15_campagnes.sql
-- Table campagnes (deplacee ici depuis le schema de base : la creer inline
-- avant que la section AUTO_INCREMENT de coolkoo.sql ne modifie
-- `partenaires.id_partenaire` provoque l'erreur MySQL 1833 "Cannot change
-- column ... used in a foreign key constraint")
-- ============================================================================
CREATE TABLE `campagnes` (
  `id_campagne` int(11) NOT NULL AUTO_INCREMENT,
  `id_partenaire` int(11) NOT NULL,
  `titre` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `emplacement` enum('carte','fil_annonces','bandeau_regional','page_partenaire') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fil_annonces',
  `visuel` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_debut` date NOT NULL,
  `date_fin` date DEFAULT NULL,
  `statut` enum('active','programmee','suspendue','terminee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'programmee',
  `date_creation` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_campagne`),
  KEY `fk_campagnes_partenaire` (`id_partenaire`),
  CONSTRAINT `fk_campagnes_partenaire` FOREIGN KEY (`id_partenaire`) REFERENCES `partenaires` (`id_partenaire`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MIGRATION 2026-07-15 : 2026-07-15_annonce_bail.sql
-- type_bail/clause_solidarite deplaces sur annonces (herites par le contrat)
-- ============================================================================
-- Migration : le type de bail et la clause de solidarite sont des attributs de
-- l'ANNONCE (cahier des charges : affiches sur la fiche coloc, choisis au Deposer).
-- Le contrat en herite ensuite (il ne les redemande plus).

ALTER TABLE `annonces`
  ADD COLUMN `type_bail` ENUM('individuel','collectif') NULL AFTER `type_propriete`,
  ADD COLUMN `clause_solidarite` ENUM('avec','sans') NULL AFTER `type_bail`;


-- ============================================================================
-- MIGRATION 2026-07-16 : 2026-07-16_demandes_service.sql
-- Table demandes_service (demandes de services hors annonce)
-- ============================================================================
-- ============================================================================
--  Demandes de service (autres services Coloc'KOO : cle_service = 'service_%')
--  Nouvelle table dediee, INDEPENDANTE des annonces (contrairement a
--  demandes_ckoo qui est liee a une annonce). Enregistre la relation entre
--  un utilisateur et les services qu'il demande depuis la page publique
--  « Service ».
--
--  Une soumission = plusieurs services => on partage la meme `reference`
--  (une ligne par service demande).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `demandes_service` (
  `id_demande_service` INT(11) NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(40) NOT NULL,
  `id_utilisateur` INT(11) NOT NULL,
  `id_service` INT(11) NOT NULL,
  `quantite` INT(11) NOT NULL DEFAULT 1,
  `prix_unitaire` INT(11) NOT NULL,
  `statut` ENUM('nouvelle','en-cours','traitee','annulee') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'nouvelle',
  `message` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `telephone` VARCHAR(30) COLLATE utf8mb4_unicode_ci NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_demande_service`),
  KEY `idx_ds_reference` (`reference`),
  KEY `fk_ds_utilisateur` (`id_utilisateur`),
  KEY `fk_ds_service` (`id_service`),
  CONSTRAINT `fk_ds_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE,
  CONSTRAINT `fk_ds_service` FOREIGN KEY (`id_service`) REFERENCES `services_ckoo` (`id_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- MIGRATION 2026-07-17 : 2026-07-17_add_suivi_demandes_service.sql
-- Colonnes de suivi demandes_service (types confirmes par demandesService.controller.js:ensureTable)
-- ============================================================================
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

-- ============================================================================
-- MIGRATION 2026-07-20 : 2026-07-20_add_cin_to_utilisateurs.sql
-- Colonne cin sur utilisateurs
-- ============================================================================
  ALTER TABLE `utilisateurs`
    ADD COLUMN `cin` VARCHAR(50) NULL AFTER `telephone`;

  -- Optional: backfill existing rows with NULL if the column already exists
  -- ALTER TABLE `utilisateurs` MODIFY COLUMN `cin` VARCHAR(50) NULL;


-- ============================================================================
-- MIGRATION 2026-07-28 : 2026-07-28_deposer_enhancements.sql
-- Colonnes DPE/equipements sur annonces + bed_type sur chambres
-- ============================================================================
ALTER TABLE `annonces`
  ADD COLUMN `energy_class` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `parking_couvert`,
  ADD COLUMN `ghg_class` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `energy_class`,
  ADD COLUMN `elevator` tinyint(1) NOT NULL DEFAULT '0' AFTER `ghg_class`,
  ADD COLUMN `pets_allowed` tinyint(1) NOT NULL DEFAULT '0' AFTER `elevator`,
  ADD COLUMN `smokers_allowed` tinyint(1) NOT NULL DEFAULT '0' AFTER `pets_allowed`,
  ADD COLUMN `women_only` tinyint(1) NOT NULL DEFAULT '0' AFTER `smokers_allowed`,
  ADD COLUMN `men_only` tinyint(1) NOT NULL DEFAULT '0' AFTER `women_only`;

ALTER TABLE `chambres`
  ADD COLUMN `bed_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `est_meuble`;

-- ============================================================================
-- MIGRATION 2026-07-29 : 2026-07-29_depot_annonce.sql
-- Tables depot_annonce + depot_annonce_chambres (brouillon de depot)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `depot_annonce` (
  `id_depot_annonce` INT NOT NULL AUTO_INCREMENT,
  `id_annonce` INT NOT NULL,
  `id_utilisateur` INT NOT NULL,
  `reference` VARCHAR(30) NOT NULL,
  `adresse` VARCHAR(255) NULL,
  `ville` VARCHAR(120) NULL,
  `quartier` VARCHAR(120) NULL,
  `latitude` DECIMAL(10,8) NULL,
  `longitude` DECIMAL(11,8) NULL,
  `type_annonce` ENUM('Colocation','Location','Appart-hôtel','Résidence étudiante','Chambre pour étudiant') NOT NULL,
  `logement` ENUM('Appartement','Maison','Villa','Cabane','Studio','Chalet','Autre') NOT NULL,
  `nombre_pieces` VARCHAR(10) NOT NULL,
  `surface` INT NULL,
  `commodites` JSON NULL,
  `regles` JSON NULL,
  `email` VARCHAR(255) NOT NULL,
  `telephone_code` VARCHAR(8) NULL DEFAULT '+261',
  `telephone` VARCHAR(40) NULL,
  `message` TEXT NULL,
  `visite_3d` TEXT NULL,
  `boost_service_id` INT NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_modification` DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_depot_annonce`),
  UNIQUE KEY `uk_depot_annonce_reference` (`reference`),
  UNIQUE KEY `uk_depot_annonce_annonce` (`id_annonce`),
  KEY `idx_depot_annonce_utilisateur` (`id_utilisateur`),
  KEY `idx_depot_annonce_type` (`type_annonce`),
  CONSTRAINT `fk_depot_annonce_annonce` FOREIGN KEY (`id_annonce`) REFERENCES `annonces` (`id_annonce`) ON DELETE CASCADE,
  CONSTRAINT `fk_depot_annonce_utilisateur` FOREIGN KEY (`id_utilisateur`) REFERENCES `utilisateurs` (`id_utilisateur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `depot_annonce_chambres` (
  `id_depot_chambre` INT NOT NULL AUTO_INCREMENT,
  `id_depot_annonce` INT NOT NULL,
  `disponible_a_partir` DATE NOT NULL,
  `loyer` INT NOT NULL DEFAULT 0,
  `charges` INT NULL,
  `caution` INT NULL,
  `surface` INT NULL,
  `meublee` ENUM('Oui','Partiellement','Non','Rachat') NULL,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_depot_chambre`),
  KEY `idx_depot_chambres_depot` (`id_depot_annonce`),
  CONSTRAINT `fk_depot_chambres_depot` FOREIGN KEY (`id_depot_annonce`) REFERENCES `depot_annonce` (`id_depot_annonce`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- MIGRATION 2026-07-31 : 2026_07_31_groupe_discussion.sql
-- Tables groupes_discussion / groupe_membres / groupe_messages / groupe_lectures
-- ============================================================================
CREATE TABLE groupes_discussion (
  id_groupe INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  id_createur INT NOT NULL,
  id_annonce INT NULL,              -- rattacher le groupe à une annonce/coloc si pertinent
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_createur) REFERENCES utilisateurs(id_utilisateur),
  CONSTRAINT fk_groupes_discussion_annonce FOREIGN KEY (id_annonce) REFERENCES annonces(id_annonce) ON DELETE CASCADE
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

-- ============================================================================
-- MIGRATION 2026-08-03 : 2026-08-03_unique_candidatures_signalements.sql
-- Deduplique candidatures puis empeche les doublons (un seul index ajoute :
-- `DROP INDEX IF EXISTS` retire, syntaxe non supportee par MySQL et inutile
-- sur une base fraiche puisque l'index n'existe pas encore)
-- ============================================================================
DELETE c1 FROM candidatures c1
JOIN candidatures c2
  ON c1.id_utilisateur = c2.id_utilisateur
 AND c1.id_annonce = c2.id_annonce
 AND c1.id_candidature > c2.id_candidature;

ALTER TABLE candidatures
  ADD UNIQUE KEY uniq_candidatures_user_annonce (id_utilisateur, id_annonce);

-- ============================================================================
-- MIGRATION 2026-08-04 : 2026-08-04_booster.sql
-- Table booster + annonces.booster/depot_annonce.boost_service_id en INT nullable
-- ============================================================================
CREATE TABLE IF NOT EXISTS `booster` (
  `id_booster` INT NOT NULL AUTO_INCREMENT,
  `nom` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `cle_service` VARCHAR(100) NOT NULL,
  `duree` INT UNSIGNED NOT NULL DEFAULT 1,
  `prix` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `unite` ENUM('heure', 'jour', 'semaine', 'mois') NOT NULL DEFAULT 'jour',
  `est_actif` TINYINT(1) NOT NULL DEFAULT 1,
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_booster`),
  UNIQUE KEY `uq_booster_cle_service` (`cle_service`),
  KEY `idx_booster_actif` (`est_actif`),
  KEY `idx_booster_cle_service` (`cle_service`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `annonces`
  MODIFY COLUMN `booster` INT NULL;

ALTER TABLE `depot_annonce`
  MODIFY COLUMN `boost_service_id` INT NULL;

-- Optionnel, a executer seulement apres avoir migre le code qui n'utilise plus ces colonnes.
-- ALTER TABLE `annonces`
--   DROP COLUMN `internet`,
--   DROP COLUMN `parking_voitures`,
--   DROP COLUMN `parking_motos`,
--   DROP COLUMN `parking_couvert`,
--   DROP COLUMN `energy_class`,
--   DROP COLUMN `ghg_class`,
--   DROP COLUMN `elevator`,
--   DROP COLUMN `pets_allowed`,
--   DROP COLUMN `smokers_allowed`,
--   DROP COLUMN `women_only`,
--   DROP COLUMN `men_only`,
--   DROP COLUMN `services_communs`;


-- ============================================================================
-- MIGRATION 2026-08-06 : 2026-08-06_groupes_discussion_automatiques.sql
-- groupes_discussion.est_cloture + groupe_messages.est_automatique/id_expediteur nullable
-- ============================================================================
-- Messages système et fermeture des groupes liés aux candidatures.
ALTER TABLE groupes_discussion
  ADD COLUMN est_cloture TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE groupe_messages
  MODIFY COLUMN id_expediteur INT NULL,
  ADD COLUMN est_automatique TINYINT(1) NOT NULL DEFAULT 0;


-- ============================================================================
-- MIGRATION 2026-08-11 : 2026-08-11_alertes_colonnes.sql
-- Colonnes des alertes dynamiques sur recherches_sauvegardees
-- ============================================================================
-- Migration : 2026-08-11_alertes_colonnes.sql
-- Ajoute les colonnes necessaires aux alertes dynamiques (TabAlertes).
-- Ignorer les erreurs "Duplicate column name" si deja appliquee.

ALTER TABLE `recherches_sauvegardees` ADD COLUMN `commodites` JSON NULL;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `rayon_km` INT NULL;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `notif_push` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `recherches_sauvegardees` ADD COLUMN `notif_email` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `recherches_sauvegardees` MODIFY COLUMN `type_propriete` VARCHAR(255) NULL;
ALTER TABLE `recherches_sauvegardees` MODIFY COLUMN `type_annonce` VARCHAR(255) NULL;


-- ============================================================================
-- MIGRATION 2026-08-12 : 2026-08-12_rgpd_security_columns.sql
-- Preferences RGPD + 2FA sur utilisateurs
-- ============================================================================
-- Ajout des colonnes pour les préférences RGPD et la double authentification (2FA)
ALTER TABLE utilisateurs ADD COLUMN rgpd_analytics TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN rgpd_partenaires TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN two_fa_enabled TINYINT(1) NOT NULL DEFAULT 0;


-- ============================================================================
-- MIGRATION 2026-08-12 : 2026-08-12_sessions_appareils.sql
-- Table sessions (appareils connectes)
-- ============================================================================
-- Migration : 2026-08-12_sessions_appareils.sql
-- Cree la table des sessions pour la fonctionnalite "Appareils connectes"
-- (suivi reel des connexions + bouton "Deconnecter les autres appareils").

CREATE TABLE IF NOT EXISTS sessions (
  id_session INT AUTO_INCREMENT PRIMARY KEY,
  id_utilisateur INT NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  type_appareil VARCHAR(20) NOT NULL DEFAULT 'desktop',
  label VARCHAR(100) NULL,
  lieu VARCHAR(100) NULL,
  dernier_usage DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessions_session_id (session_id),
  KEY idx_sessions_utilisateur (id_utilisateur)
);


-- ============================================================================
-- MIGRATION 2026-08-13 : 2026_08_13_alter_table_annonce.sql
-- Colonnes internet/parking sur depot_annonce (nom de fichier trompeur : ne touche pas annonces)
-- ============================================================================
ALTER TABLE depot_annonce 
ADD COLUMN internet ENUM('ADSL','Fibre','Box','Aucune') NULL, 
ADD COLUMN parking_voitures INT DEFAULT 0, 
ADD COLUMN parking_motos INT DEFAULT 0,  
ADD COLUMN parking_couvert TINYINT(1) DEFAULT 0; 

-- ============================================================================
-- MIGRATION 2026-08-18 : 2026_08_18_preferences_utilisateur.sql
-- Table preferences_utilisateur + colonnes mode_allege/disponibilite_hors_ligne
-- (commentaire `//` corrige en `--`, `//` n'est pas un commentaire SQL valide)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `preferences_utilisateur` (
  `id_utilisateur` INT NOT NULL,
  `mode_defaut` VARCHAR(10) NOT NULL DEFAULT 'push',
  `evenements` JSON DEFAULT NULL,
  `date_mise_a_jour` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id_utilisateur`),

  CONSTRAINT `fk_preferences_utilisateur`
    FOREIGN KEY (`id_utilisateur`)
    REFERENCES `utilisateurs` (`id_utilisateur`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ajout deux colonnes
ALTER TABLE preferences_utilisateur
  ADD COLUMN mode_allege TINYINT(1) NOT NULL DEFAULT 0 AFTER mode_defaut,
  ADD COLUMN disponibilite_hors_ligne TINYINT(1) NOT NULL DEFAULT 1 AFTER mode_allege;

-- ============================================================================
-- MIGRATION 2026-08-19 : 2026_08_19_fix_villes_id_villes_autoincrement.sql
-- Active AUTO_INCREMENT sur villes.id_ville
-- ============================================================================
-- ============================================================
-- MIGRATION: 2026-08-19_fix_villes_id_ville_autoincrement.sql
-- DESCRIPTION: `villes.id_ville` était une clé primaire (INT) mais sans
--              AUTO_INCREMENT. Résultat : toute création d'une nouvelle
--              ville (ex: depuis le dépôt d'annonce) échouait avec
--              l'erreur MySQL "Field 'id_ville' doesn't have a default
--              value". Cette migration active l'AUTO_INCREMENT et
--              recale le compteur juste après le plus grand id existant
--              pour éviter toute collision avec des lignes déjà en base.
--              Sans danger à rejouer : ne modifie rien si déjà appliquée.
-- ============================================================

-- 1. Active AUTO_INCREMENT sur la colonne id_ville (déjà PRIMARY KEY).
ALTER TABLE `villes` MODIFY `id_ville` INT NOT NULL AUTO_INCREMENT;

-- 2. Recale le compteur d'auto-incrémentation juste après le plus grand
--    id_ville existant, pour ne jamais réutiliser un id déjà pris.
SET @next_id = (SELECT IFNULL(MAX(id_ville), 0) + 1 FROM `villes`);
SET @sql = CONCAT('ALTER TABLE `villes` AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '✅ Migration 2026-08-19_fix_villes_id_ville_autoincrement terminée avec succès' AS status;


-- ============================================================================
-- MIGRATION 2026-09-04 : 20226-09-04-Modification-table.sql
-- (nom de fichier original avec coquille sur l'annee "20226")
-- Seule la cle unique sur membres_equipes est conservee :
--  - `groupe_messages.est_automatique` deja ajoutee le 2026-08-06
--  - les colonnes de suivi de `demandes_service` deja ajoutees le 2026-07-17
--    (avec des types differents et incompatibles ici -> auraient de toute
--    facon leve "Duplicate column name")
-- ============================================================================
ALTER TABLE membres_equipes ADD UNIQUE KEY uniq_equipe_utilisateur (id_equipe, id_utilisateur);

-- ============================================================================
-- MIGRATION 2026-09-09 : 2026-09-09_villes_unique_nom.sql
-- Deduplique villes.nom_ville puis ajoute une contrainte unique
-- ============================================================================
-- ============================================================
-- MIGRATION: 2026-09-09_villes_unique_nom.sql
-- DESCRIPTION: `villes.nom_ville` n'avait aucune contrainte d'unicité.
--              `Database/seed.js` insère les 6 villes de base via
--              `INSERT IGNORE ... SELECT`, en comptant sur une violation
--              de contrainte unique pour ne rien faire si la ville existe
--              déjà — mais sans index unique, `INSERT IGNORE` n'ignore
--              jamais rien : chaque exécution de `npm run seed` recrée
--              un doublon de chaque ville (constaté en base : 12 lignes
--              pour 6 villes réelles, ex. deux "Antananarivo").
--              Cette migration déduplique les lignes existantes (en
--              conservant l'id_ville le plus bas par nom) puis ajoute
--              la contrainte unique pour empêcher toute récidive.
--              Sans danger à rejouer.
-- ============================================================

-- 1. Repointe les éventuelles références (annonces, utilisateurs,
--    recherches sauvegardées) des doublons vers la ligne conservée.
UPDATE annonces a
JOIN villes v_dup ON v_dup.id_ville = a.id_ville
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET a.id_ville = v_keep.id_ville;

UPDATE utilisateurs u
JOIN villes v_dup ON v_dup.id_ville = u.ville_actuelle
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET u.ville_actuelle = v_keep.id_ville;

UPDATE utilisateurs u
JOIN villes v_dup ON v_dup.id_ville = u.ville_origine
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET u.ville_origine = v_keep.id_ville;

UPDATE recherches_sauvegardees r
JOIN villes v_dup ON v_dup.id_ville = r.id_ville
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville
SET r.id_ville = v_keep.id_ville;

-- 2. Supprime les doublons (ne garde que le plus petit id_ville par nom).
DELETE v_dup FROM villes v_dup
JOIN villes v_keep ON v_keep.nom_ville = v_dup.nom_ville AND v_keep.id_ville < v_dup.id_ville;

-- 3. Empêche toute récidive.
ALTER TABLE `villes` ADD UNIQUE KEY `uniq_villes_nom` (`nom_ville`);

SELECT '✅ Migration 2026-09-09_villes_unique_nom terminée avec succès' AS status;


-- ============================================================================
-- Restauration des variables de session (deplacee ici depuis coolkoo.sql pour
-- garder SET NAMES utf8mb4 actif pendant toutes les migrations ci-dessus)
-- ============================================================================
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
