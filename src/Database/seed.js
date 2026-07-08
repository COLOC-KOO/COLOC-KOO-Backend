const bcrypt = require('bcryptjs');
const { query } = require('../Services/db.service');

async function ensureRow(sql, params = [], lookupSql, lookupParams = []) {
  const rows = await query(lookupSql, lookupParams);
  if (rows.length > 0) {
    return rows[0];
  }
  const result = await query(sql, params);
  return result;
}

async function main() {
  const refresh = process.argv.includes('--refresh');

  if (refresh) {
    await query('SET FOREIGN_KEY_CHECKS = 0');
    await query('TRUNCATE TABLE candidature_membres');
    await query('TRUNCATE TABLE candidatures');
    await query('TRUNCATE TABLE notifications');
    await query('TRUNCATE TABLE messages_contact');
    await query('TRUNCATE TABLE demandes_partenaires');
    await query('TRUNCATE TABLE favoris');
    await query('TRUNCATE TABLE regles_annonces');
    await query('TRUNCATE TABLE equipements_annonces');
    await query('TRUNCATE TABLE photos_annonces');
    await query('TRUNCATE TABLE chambres');
    await query('TRUNCATE TABLE annonces');
    await query('TRUNCATE TABLE partenaires');
    await query('TRUNCATE TABLE utilisateurs');
    await query('TRUNCATE TABLE villes');
    await query('TRUNCATE TABLE regions');
    await query('TRUNCATE TABLE langues');
    await query('TRUNCATE TABLE roles');
    await query('SET FOREIGN_KEY_CHECKS = 1');
  }

  await query("INSERT INTO roles (nom_role, description) VALUES ('coloc', 'Colocataire'), ('proprio', 'Proprietaire'), ('agent', 'Agent ou partenaire'), ('moderator', 'Moderation'), ('admin', 'Administration'), ('super_admin', 'Super administration') ON DUPLICATE KEY UPDATE description = VALUES(description)");
  await query("INSERT INTO langues (code_langue, nom_langue) VALUES ('FR', 'Francais'), ('MG', 'Malagasy'), ('ENG', 'English') ON DUPLICATE KEY UPDATE nom_langue = VALUES(nom_langue)");
  await query("INSERT INTO regions (nom_region) VALUES ('Analamanga'), ('Boeny'), ('Atsinanana'), ('Haute Matsiatra'), ('Vakinankaratra'), ('Diana') ON DUPLICATE KEY UPDATE nom_region = VALUES(nom_region)");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Antananarivo', id_region FROM regions WHERE nom_region = 'Analamanga'");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Mahajanga', id_region FROM regions WHERE nom_region = 'Boeny'");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Toamasina', id_region FROM regions WHERE nom_region = 'Atsinanana'");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Fianarantsoa', id_region FROM regions WHERE nom_region = 'Haute Matsiatra'");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Antsirabe', id_region FROM regions WHERE nom_region = 'Vakinankaratra'");
  await query("INSERT IGNORE INTO villes (nom_ville, id_region) SELECT 'Antsiranana', id_region FROM regions WHERE nom_region = 'Diana'");

  const hash = await bcrypt.hash('Password123!', 10);
  await query(
    `INSERT INTO utilisateurs
     (email, telephone, mot_de_passe, nom, prenom, age, bio, profession, est_verifie, statut, id_role)
     VALUES
     ('coloc@email.mg', '+261340000001', ?, 'Rakoto', 'Andriamahefa', 26, 'Developpeur web', 'Developpeur', 1, 'active', (SELECT id_role FROM roles WHERE nom_role = 'coloc' LIMIT 1)),
     ('superadmin@email.mg', '+261340000002', ?, 'Rabe', 'Miandrisoa', 32, 'Proprietaire verifie', 'super_admin', 1, 'active', (SELECT id_role FROM roles WHERE nom_role = 'super_admin' LIMIT 1)),
     ('moderateur@colockoo.mg', '+261340000003', ?, 'Moderateur', 'Equipe', 30, 'Moderation', 'Moderateur', 1, 'active', (SELECT id_role FROM roles WHERE nom_role = 'moderator' LIMIT 1)),
     ('admin@colockoo.mg', '+261340000004', ?, 'Super', 'Admin', 34, 'Administration', 'Administrateur', 1, 'active', (SELECT id_role FROM roles WHERE nom_role = 'admin' LIMIT 1))
     ON DUPLICATE KEY UPDATE nom = VALUES(nom)`,
    [hash, hash, hash, hash]
  );

  const [tana] = await query("SELECT id_ville FROM villes WHERE nom_ville = 'Antananarivo' LIMIT 1");
  const [maha] = await query("SELECT id_ville FROM villes WHERE nom_ville = 'Mahajanga' LIMIT 1");
  const [toam] = await query("SELECT id_ville FROM villes WHERE nom_ville = 'Toamasina' LIMIT 1");

  const [proprio] = await query("SELECT id_utilisateur FROM utilisateurs WHERE email = 'superadmin@email.mg' LIMIT 1");
  const [coloc] = await query("SELECT id_utilisateur FROM utilisateurs WHERE email = 'coloc@email.mg' LIMIT 1");

  await query(
    `INSERT INTO annonces
     (id_utilisateur, reference, titre, description, statut, type_bailleur, mode_annonce, type_annonce, type_propriete, total_colocataires, surface_totale, quartier, id_ville, internet, parking_voitures, parking_motos, parking_couvert, booster)
     VALUES
     (?, 'CK-100001', 'Maison avec jardin - Ankadifotsy', 'Maison lumineuse avec jardin et parking', 'active', 'proprio', 'complete', 'creation', 'maison', 4, 110, 'Ankadifotsy', ?, 'Fibre', 1, 1, 0, 1),
     (?, 'CK-100002', 'Appartement moderne - Analakely', 'Appartement centre ville', 'active', 'membre', 'complete', 'existante', 'appartement', 3, 75, 'Analakely', ?, 'ADSL', 0, 1, 0, 0),
     (?, 'CK-100003', 'Villa a constituer - Iavoloha', 'Villa securisee avec piscine', 'pending', 'proprio', 'complete', 'creation', 'villa', 4, 160, 'Iavoloha', ?, 'Fibre', 2, 2, 1, 0)
     ON DUPLICATE KEY UPDATE titre = VALUES(titre)`,
    [proprio.id_utilisateur, tana.id_ville, coloc.id_utilisateur, tana.id_ville, proprio.id_utilisateur, tana.id_ville]
  );

  const [annonce1] = await query("SELECT id_annonce FROM annonces WHERE reference = 'CK-100001' LIMIT 1");
  const [annonce2] = await query("SELECT id_annonce FROM annonces WHERE reference = 'CK-100002' LIMIT 1");

  await query(
    `INSERT INTO chambres
     (id_annonce, surface, est_meuble, prix_loyer, prix_charges, type_garantie, montant_garantie, date_disponibilite)
     VALUES
     (?, 22, 'Oui', 810000, 50000, '1mois', 810000, CURDATE()),
     (?, 14, 'Partiellement', 280000, 30000, '1mois', 280000, CURDATE())
     ON DUPLICATE KEY UPDATE surface = VALUES(surface)`,
    [annonce1.id_annonce, annonce2.id_annonce]
  );

  await query("INSERT IGNORE INTO equipements_annonces (id_annonce, amenity) VALUES (?, 'Parking voiture'), (?, 'Connexion internet')", [annonce1.id_annonce, annonce2.id_annonce]);
  await query("INSERT IGNORE INTO regles_annonces (id_annonce, regle) VALUES (?, 'Mixte'), (?, 'Non-fumeur')", [annonce1.id_annonce, annonce2.id_annonce]);
  await query("INSERT IGNORE INTO partenaires (nom, secteur, niveau, remise, engagement, logo) VALUES ('BNI Madagascar', 'Banque & Finance', 'Diamant', '5% sur frais de dossier', 'Accompagnement bancaire', 'BNI')");
  await query("INSERT IGNORE INTO notifications (id_utilisateur, type_notification, titre, texte, lien) VALUES (?, 'systeme', 'Bienvenue', 'Votre compte est pret.', '/compte')", [coloc.id_utilisateur]);

  console.log('Seed termine.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

