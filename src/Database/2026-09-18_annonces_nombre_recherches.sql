-- Nombre de colocataires recherches par l'annonce (affiche sur la fiche
-- annonce : « X colocataire(s) recherche(s) »). Renseigne par le depot
-- d'annonce pour le profil « membre de la colocation ».
ALTER TABLE `annonces`
  ADD COLUMN `nombre_recherches` int(11) DEFAULT NULL AFTER `total_colocataires`;
