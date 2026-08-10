-- Garantit qu'un utilisateur ne peut postuler qu'une seule fois a une annonce.
-- La suppression conserve la candidature la plus ancienne et retire les doublons.

DELETE c1 FROM candidatures c1
JOIN candidatures c2
  ON c1.id_utilisateur = c2.id_utilisateur
 AND c1.id_annonce = c2.id_annonce
 AND c1.id_candidature > c2.id_candidature;

ALTER TABLE candidatures
  DROP INDEX IF EXISTS uniq_candidatures_user_annonce,
  ADD UNIQUE KEY uniq_candidatures_user_annonce (id_utilisateur, id_annonce);
