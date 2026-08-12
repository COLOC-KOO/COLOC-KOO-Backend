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
