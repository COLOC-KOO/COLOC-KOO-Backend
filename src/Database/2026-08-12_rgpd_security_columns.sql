-- Ajout des colonnes pour les préférences RGPD et la double authentification (2FA)
ALTER TABLE utilisateurs ADD COLUMN rgpd_analytics TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN rgpd_partenaires TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN two_fa_enabled TINYINT(1) NOT NULL DEFAULT 0;
