-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Base de données : coolko
-- Généré le : Lun 30 Juin 2026 à 10:00

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

--
-- Base de données : coolko
--
CREATE DATABASE IF NOT EXISTS coolko DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE coolko;

-- --------------------------------------------------------

--
-- Structure de la table users (comptes utilisateurs)
--
CREATE TABLE users (
  id int(11) NOT NULL AUTO_INCREMENT,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  email varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  phone varchar(30) DEFAULT NULL,
  role enum('moderator','admin','super_admin','user') NOT NULL DEFAULT 'user',
  status enum('active','inactive','suspended','banned') NOT NULL DEFAULT 'active',
  suspension_end datetime DEFAULT NULL,
  profile_picture varchar(255) DEFAULT NULL,
  bio text DEFAULT NULL,
  age int(3) DEFAULT NULL,
  city varchar(100) DEFAULT NULL,
  origin_city varchar(100) DEFAULT NULL,
  occupation varchar(100) DEFAULT NULL,
  is_verified tinyint(1) NOT NULL DEFAULT 0,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table listings (annonces)
--
CREATE TABLE listings (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  reference varchar(20) NOT NULL,
  title varchar(255) NOT NULL,
  description text DEFAULT NULL,
  status enum('pending','active','expired','archived','rejected') NOT NULL DEFAULT 'pending',
  type enum('membre','proprio','pro') NOT NULL,
  mode enum('flux','complete') NOT NULL DEFAULT 'complete',
  annonce_type enum('existante','creation') NOT NULL DEFAULT 'existante',
  property_type enum('appartement','maison','autre') NOT NULL DEFAULT 'appartement',
  total_tenants int(11) DEFAULT NULL,
  total_surface int(11) DEFAULT NULL,
  address varchar(255) DEFAULT NULL,
  neighborhood varchar(255) DEFAULT NULL,
  city varchar(100) DEFAULT NULL,
  latitude decimal(10,8) DEFAULT NULL,
  longitude decimal(11,8) DEFAULT NULL,
  internet enum('ADSL','Fibre','Box','Aucune') DEFAULT NULL,
  parking_cars int(11) DEFAULT 0,
  parking_bikes int(11) DEFAULT 0,
  parking_covered tinyint(1) DEFAULT 0,
  common_services json DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at datetime DEFAULT NULL,
  expires_at datetime DEFAULT NULL,
  updated_at datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY reference_unique (reference),
  KEY fk_listings_user (user_id),
  CONSTRAINT fk_listings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table rooms (chambres disponibles)
--
CREATE TABLE rooms (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  surface int(11) DEFAULT NULL,
  is_furnished enum('Oui','Partiellement','Non','Rachat') DEFAULT NULL,
  furniture_price int(11) DEFAULT NULL,
  furniture_description text DEFAULT NULL,
  rent_price int(11) NOT NULL,
  charges_price int(11) DEFAULT NULL,
  deposit_type enum('1mois','autre') DEFAULT '1mois',
  deposit_amount int(11) DEFAULT NULL,
  availability_date date NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_rooms_listing (listing_id),
  CONSTRAINT fk_rooms_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table listing_photos (photos des annonces)
--
CREATE TABLE listing_photos (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  url varchar(255) NOT NULL,
  is_cover tinyint(1) NOT NULL DEFAULT 0,
  order_index int(11) NOT NULL DEFAULT 0,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_photos_listing (listing_id),
  CONSTRAINT fk_photos_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table listing_amenities (équipements)
--
CREATE TABLE listing_amenities (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  amenity varchar(100) NOT NULL,
  PRIMARY KEY (id),
  KEY fk_amenities_listing (listing_id),
  CONSTRAINT fk_amenities_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table listing_rules (règles de la coloc)
--
CREATE TABLE listing_rules (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  rule varchar(100) NOT NULL,
  PRIMARY KEY (id),
  KEY fk_rules_listing (listing_id),
  CONSTRAINT fk_rules_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table partners (partenaires B2B)
--
CREATE TABLE partners (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) DEFAULT NULL,
  company_name varchar(255) NOT NULL,
  category enum('Entreprise générale','Immobilier','Institution publique') NOT NULL,
  tier varchar(50) DEFAULT NULL,
  status enum('actif','attente','suspendu') NOT NULL DEFAULT 'attente',
  visibility_level int(11) NOT NULL DEFAULT 0,
  logo_url varchar(255) DEFAULT NULL,
  contact_name varchar(255) DEFAULT NULL,
  contact_function varchar(255) DEFAULT NULL,
  contact_phone varchar(30) DEFAULT NULL,
  contact_email varchar(255) DEFAULT NULL,
  contact_address text DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_partners_user (user_id),
  CONSTRAINT fk_partners_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table campaigns (campagnes publicitaires)
--
CREATE TABLE campaigns (
  id int(11) NOT NULL AUTO_INCREMENT,
  partner_id int(11) NOT NULL,
  name varchar(255) NOT NULL,
  placement enum('encart','bandeau','carte') NOT NULL,
  region varchar(100) DEFAULT NULL,
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  visual_url varchar(255) DEFAULT NULL,
  status enum('programmee','active','suspendue') NOT NULL DEFAULT 'programmee',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_campaigns_partner (partner_id),
  CONSTRAINT fk_campaigns_partner FOREIGN KEY (partner_id) REFERENCES partners (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table teams (équipes pour le mode "Colocation complète")
--
CREATE TABLE teams (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  name varchar(255) NOT NULL,
  mood text DEFAULT NULL,
  status enum('forming','complete','selected','rejected') NOT NULL DEFAULT 'forming',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_teams_listing (listing_id),
  CONSTRAINT fk_teams_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table team_members (membres d'une équipe)
--
CREATE TABLE team_members (
  id int(11) NOT NULL AUTO_INCREMENT,
  team_id int(11) NOT NULL,
  user_id int(11) NOT NULL,
  status enum('pending','accepted','refused','left') NOT NULL DEFAULT 'pending',
  joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_team_members_team (team_id),
  KEY fk_team_members_user (user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table messages (messagerie)
--
CREATE TABLE messages (
  id int(11) NOT NULL AUTO_INCREMENT,
  sender_id int(11) NOT NULL,
  receiver_id int(11) NOT NULL,
  listing_id int(11) DEFAULT NULL,
  subject varchar(255) DEFAULT NULL,
  content text NOT NULL,
  is_read tinyint(1) NOT NULL DEFAULT 0,
  parent_id int(11) DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_messages_sender (sender_id),
  KEY fk_messages_receiver (receiver_id),
  KEY fk_messages_listing (listing_id),
  CONSTRAINT fk_messages_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table reports (signalements)
--
CREATE TABLE reports (
  id int(11) NOT NULL AUTO_INCREMENT,
  reporter_id int(11) NOT NULL,
  target_user_id int(11) DEFAULT NULL,
  listing_id int(11) DEFAULT NULL,
  message_id int(11) DEFAULT NULL,
  reason varchar(255) NOT NULL,
  description text DEFAULT NULL,
  status enum('new','in_progress','resolved','dismissed') NOT NULL DEFAULT 'new',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at datetime DEFAULT NULL,
  PRIMARY KEY (id),
  KEY fk_reports_reporter (reporter_id),
  KEY fk_reports_target_user (target_user_id),
  KEY fk_reports_listing (listing_id),
  KEY fk_reports_message (message_id),
  CONSTRAINT fk_reports_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_target_user FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table contracts (contrats et EDL)
--
CREATE TABLE contracts (
  id int(11) NOT NULL AUTO_INCREMENT,
  reference varchar(20) NOT NULL,
  listing_id int(11) NOT NULL,
  type enum('contrat','edl') NOT NULL,
  status enum('a-emettre','a-planifier','emis','annule') NOT NULL DEFAULT 'a-emettre',
  total_amount int(11) DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_at datetime DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY reference_unique_contract (reference),
  KEY fk_contracts_listing (listing_id),
  CONSTRAINT fk_contracts_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table contract_parties (parties d'un contrat)
--
CREATE TABLE contract_parties (
  id int(11) NOT NULL AUTO_INCREMENT,
  contract_id int(11) NOT NULL,
  user_id int(11) DEFAULT NULL,
  full_name varchar(255) DEFAULT NULL,
  role varchar(50) NOT NULL,
  cin varchar(50) DEFAULT NULL,
  phone varchar(30) DEFAULT NULL,
  email varchar(255) DEFAULT NULL,
  comment text DEFAULT NULL,
  PRIMARY KEY (id),
  KEY fk_contract_parties_contract (contract_id),
  KEY fk_contract_parties_user (user_id),
  CONSTRAINT fk_contract_parties_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE,
  CONSTRAINT fk_contract_parties_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table payments (versements)
--
CREATE TABLE payments (
  id int(11) NOT NULL AUTO_INCREMENT,
  reference varchar(20) NOT NULL,
  user_id int(11) NOT NULL,
  contract_id int(11) DEFAULT NULL,
  listing_id int(11) DEFAULT NULL,
  partner_id int(11) DEFAULT NULL,
  amount_due int(11) NOT NULL,
  amount_received int(11) NOT NULL,
  channel enum('MVOLA','Orange Money','Autre') NOT NULL,
  status enum('a-verifier','conforme','non-conforme') NOT NULL DEFAULT 'a-verifier',
  payment_date date NOT NULL,
  reference_operator varchar(255) DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY reference_unique_payment (reference),
  KEY fk_payments_user (user_id),
  KEY fk_payments_contract (contract_id),
  KEY fk_payments_listing (listing_id),
  KEY fk_payments_partner (partner_id),
  CONSTRAINT fk_payments_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_partner FOREIGN KEY (partner_id) REFERENCES partners (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table ckoo_services (offres de services Coloc'KOO)
--
CREATE TABLE ckoo_services (
  id int(11) NOT NULL AUTO_INCREMENT,
  service_key varchar(50) NOT NULL,
  name varchar(255) NOT NULL,
  description text DEFAULT NULL,
  price int(11) NOT NULL,
  unit enum('heure','forfait','jour','mois','an','stere') NOT NULL DEFAULT 'heure',
  is_active tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY service_key_unique (service_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table ckoo_requests (demandes de services)
--
CREATE TABLE ckoo_requests (
  id int(11) NOT NULL AUTO_INCREMENT,
  listing_id int(11) NOT NULL,
  user_id int(11) NOT NULL,
  status enum('a-contacter','en-cours','valide','annule') NOT NULL DEFAULT 'a-contacter',
  contact_history text DEFAULT NULL,
  synthesis text DEFAULT NULL,
  appointment_date datetime DEFAULT NULL,
  appointment_note text DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_ckoo_requests_listing (listing_id),
  KEY fk_ckoo_requests_user (user_id),
  CONSTRAINT fk_ckoo_requests_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
  CONSTRAINT fk_ckoo_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table ckoo_request_items (lignes d'une demande)
--
CREATE TABLE ckoo_request_items (
  id int(11) NOT NULL AUTO_INCREMENT,
  request_id int(11) NOT NULL,
  service_id int(11) NOT NULL,
  quantity int(11) NOT NULL DEFAULT 1,
  unit_price int(11) NOT NULL,
  total_price int(11) GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL,
  PRIMARY KEY (id),
  KEY fk_ckoo_items_request (request_id),
  KEY fk_ckoo_items_service (service_id),
  CONSTRAINT fk_ckoo_items_request FOREIGN KEY (request_id) REFERENCES ckoo_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_ckoo_items_service FOREIGN KEY (service_id) REFERENCES ckoo_services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table notifications
--
CREATE TABLE notifications (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  type enum('message','alert','system','application') NOT NULL,
  title varchar(255) DEFAULT NULL,
  content text NOT NULL,
  link varchar(255) DEFAULT NULL,
  is_read tinyint(1) NOT NULL DEFAULT 0,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_notifications_user (user_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table logs (journal d'actions)
--
CREATE TABLE logs (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) DEFAULT NULL,
  action_type enum('Validation','Rejet','Correction','Suspension','Message','Connexion') NOT NULL,
  target varchar(100) DEFAULT NULL,
  details text DEFAULT NULL,
  ip_address varchar(45) DEFAULT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_logs_user (user_id),
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table user_preferences (préférences utilisateur)
--
CREATE TABLE user_preferences (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  preference_key varchar(100) NOT NULL,
  preference_value text DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY user_preference_unique (user_id,`preference_key`),
  CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table saved_searches (alertes enregistrées)
--
CREATE TABLE saved_searches (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  name varchar(255) DEFAULT NULL,
  city varchar(100) DEFAULT NULL,
  neighborhood varchar(100) DEFAULT NULL,
  max_price int(11) DEFAULT NULL,
  property_type varchar(50) DEFAULT NULL,
  rules json DEFAULT NULL,
  annonce_type varchar(50) DEFAULT NULL,
  is_active tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_saved_searches_user (user_id),
  CONSTRAINT fk_saved_searches_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table favorites (favoris)
--
CREATE TABLE favorites (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  listing_id int(11) NOT NULL,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_listing_unique (user_id,`listing_id`),
  KEY fk_favorites_listing (listing_id),
  CONSTRAINT fk_favorites_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table configurations (paramètres globaux)
--
CREATE TABLE configurations (
  id int(11) NOT NULL AUTO_INCREMENT,
  config_key varchar(100) NOT NULL,
  config_value text DEFAULT NULL,
  description text DEFAULT NULL,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY config_key_unique (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Données initiales : Configuration
--
INSERT INTO configurations (config_key, config_value, description) VALUES
('listing_duration', '60', 'Durée de validité d\'une annonce en jours'),
('partner_listing_duration', '120', 'Durée de validité d\'une annonce partenaire en jours'),
('auto_validation_minutes', '60', 'Délai avant validation automatique (minutes)'),
('max_photos', '3', 'Nombre maximum de photos par annonce'),
('max_photos_size_mb', '3', 'Taille maximale par photo en Mo'),
('launch_free', 'true', 'Mode gratuit pour les annonces partenaires (true/false)'),
('min_rooms', '2', 'Nombre minimum de chambres pour une colocation');

-- --------------------------------------------------------

--
-- Données initiales : Services Coloc'KOO
--
INSERT INTO ckoo_services (service_key, name, description, price, unit) VALUES
('menage', 'Propreté (ménage, linge, etc.)', 'Service de ménage régulier', 5800, 'heure'),
('jardin', 'Jardinage', 'Entretien des espaces verts', 4500, 'heure'),
('gardien', 'Gardiennage', 'Surveillance du logement', 10800, 'heure'),
('jirama', 'Relevés Jirama et traçabilité', 'Gestion des relevés d\'eau et électricité', 9000, 'forfait'),
('travaux', 'Entretien et réalisation petits travaux', 'Petites réparations et entretien', 46400, 'forfait'),
('ramonage', 'Ramonage annuel', 'Nettoyage des conduits', 84000, 'an'),
('bois', 'Livraison annuelle de bois de chauffe', 'Livraison de bois de chauffage', 14000, 'stere');

-- --------------------------------------------------------

--
-- Données initiales : Utilisateurs de test
-- Les mots de passe sont hashés avec password_hash() pour "admin123"
--
INSERT INTO users (first_name, last_name, email, password_hash, role, status, is_verified) VALUES 
('Admin', 'Système', 'admin@coolko.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'super_admin', 'active', 1),
('Modérateur', 'Test', 'mod@coolko.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'moderator', 'active', 1),
('Hanta', 'Rakoto', 'hanta.rakoto@email.mg', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 'active', 0),
('Rado', 'Andriana', 'rado.andriana@email.mg', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 'active', 0);

--
-- Index pour les tables exportées
--

--
-- Index de la table listings
--
ALTER TABLE listings
  ADD KEY idx_listings_status (status),
  ADD KEY idx_listings_city (city),
  ADD KEY idx_listings_created (created_at);

--
-- Index de la table messages
--
ALTER TABLE messages
  ADD KEY idx_messages_created (created_at),
  ADD KEY idx_messages_read (is_read);

--
-- Index de la table users
--
ALTER TABLE users
  ADD KEY idx_users_email (email),
  ADD KEY idx_users_role (role);

--
-- Index de la table payments
--
ALTER TABLE payments
  ADD KEY idx_payments_date (payment_date),
  ADD KEY idx_payments_status (status);

--
-- Index de la table logs
--
ALTER TABLE logs
  ADD KEY idx_logs_created (created_at),
  ADD KEY idx_logs_action (action_type);

COMMIT;