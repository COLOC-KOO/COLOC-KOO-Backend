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
