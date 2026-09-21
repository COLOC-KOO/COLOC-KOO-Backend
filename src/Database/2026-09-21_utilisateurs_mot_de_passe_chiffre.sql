-- Copie reversible du mot de passe, chiffree en AES-256-GCM (cle dans le .env).
-- Permet au proprietaire du compte de reafficher son mot de passe en clair.
-- La colonne `mot_de_passe` (hash bcrypt) reste la seule reference pour la connexion.
--
-- NULL pour les comptes existants : leur hash bcrypt est irreversible, la copie
-- sera remplie automatiquement a leur prochaine connexion reussie.
ALTER TABLE utilisateurs ADD COLUMN mot_de_passe_chiffre TEXT NULL DEFAULT NULL;
