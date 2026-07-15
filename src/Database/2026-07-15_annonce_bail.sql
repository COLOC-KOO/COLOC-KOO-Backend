-- Migration : le type de bail et la clause de solidarite sont des attributs de
-- l'ANNONCE (cahier des charges : affiches sur la fiche coloc, choisis au Deposer).
-- Le contrat en herite ensuite (il ne les redemande plus).

ALTER TABLE `annonces`
  ADD COLUMN `type_bail` ENUM('individuel','collectif') NULL AFTER `type_propriete`,
  ADD COLUMN `clause_solidarite` ENUM('avec','sans') NULL AFTER `type_bail`;
