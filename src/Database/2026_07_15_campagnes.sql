-- --------------------------------------------------------
-- Table structure for table `campagnes`
-- --------------------------------------------------------

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