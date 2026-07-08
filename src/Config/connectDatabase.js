const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;

function getConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ColocKOO',
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  };
}

async function ensureDatabase() {
  const config = getConfig();
  const dbName = config.database;

  const connection = await mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
}

async function initPool() {
  if (!pool) {
    await ensureDatabase();
    pool = mysql.createPool(getConfig());
  }
  return pool;
}

async function ensureUserProfileColumn() {
  try {
    const dbPool = await initPool();
    await dbPool.query('ALTER TABLE utilisateurs MODIFY COLUMN profile_picture MEDIUMTEXT NULL');
    const [dateColumns] = await dbPool.query("SHOW COLUMNS FROM utilisateurs LIKE 'date_naissance'");
    if (dateColumns.length === 0) {
      await dbPool.query('ALTER TABLE utilisateurs ADD COLUMN date_naissance DATE NULL');
    }
  } catch (error) {
    console.warn('Impossible d’ajuster les colonnes de profil:', error.message);
  }
}

async function ensurePartenaireRequestSchema() {
  try {
    const dbPool = await initPool();
    const columnsToAdd = [
      { name: 'nom_contact', definition: "VARCHAR(255) NULL" },
      { name: 'telephone', definition: "VARCHAR(40) NULL" },
      { name: 'telephone_code', definition: "VARCHAR(8) NULL" },
      { name: 'souhaite_rappel', definition: "TINYINT(1) NOT NULL DEFAULT 0" },
      { name: 'date_rappel', definition: "DATE NULL" },
      { name: 'creneau_rappel', definition: "VARCHAR(40) NULL" },
      { name: 'souhaite_plaquette', definition: "TINYINT(1) NOT NULL DEFAULT 0" },
    ];

    for (const column of columnsToAdd) {
      const [existing] = await dbPool.query(`SHOW COLUMNS FROM demandes_partenaires LIKE ?`, [column.name]);
      if (existing.length === 0) {
        await dbPool.query(`ALTER TABLE demandes_partenaires ADD COLUMN \`${column.name}\` ${column.definition}`);
      }
    }
  } catch (error) {
    console.warn('Impossible d’ajuster le schema des demandes partenaires:', error.message);
  }
}

async function ensureBusinessSchema() {
  try {
    const dbPool = await initPool();
    await dbPool.query("ALTER TABLE candidatures MODIFY COLUMN statut ENUM('envoyee','recu','dossier','signature','convention','en_attente','acceptee','refusee','constituee') NOT NULL DEFAULT 'envoyee'");
    await dbPool.query("ALTER TABLE contrats MODIFY COLUMN statut ENUM('a-emettre','a-planifier','brouillon','emis','envoye','signe','annule') NOT NULL DEFAULT 'a-emettre'");
    await dbPool.query("ALTER TABLE photos_annonces MODIFY COLUMN url LONGTEXT NOT NULL").catch(() => {});
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS journal_actions (
        id_action INT NOT NULL AUTO_INCREMENT,
        id_utilisateur INT NULL,
        action VARCHAR(80) NOT NULL,
        cible_type VARCHAR(80) NULL,
        cible_id INT NULL,
        details JSON NULL,
        date_action DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_action),
        KEY idx_journal_action_date (date_action),
        KEY idx_journal_action_type (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS objectifs_equipe (
        id_objectif INT NOT NULL AUTO_INCREMENT,
        libelle VARCHAR(255) NOT NULL,
        objectif INT NOT NULL DEFAULT 0,
        realise INT NOT NULL DEFAULT 0,
        periode ENUM('jour','semaine','mois','trimestre','annee') NOT NULL DEFAULT 'mois',
        statut ENUM('actif','termine','archive') NOT NULL DEFAULT 'actif',
        date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_objectif)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS configuration_backoffice (
        cle VARCHAR(120) NOT NULL,
        valeur JSON NULL,
        date_modification DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (cle)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await ensurePartenaireRequestSchema();
  } catch (error) {
    console.warn('Impossible d ajuster le schema metier:', error.message);
  }
}

async function getPool() {
  return initPool();
}

async function testConnection() {
  try {
    const dbPool = await initPool();
    const connection = await dbPool.getConnection();
    console.log('Connecte a la base de donnees MySQL');
    connection.release();
    return true;
  } catch (error) {
    console.error('Erreur de connexion a la base de donnees:', error.message);
    return false;
  }
}

module.exports = {
  getPool,
  testConnection,
  ensureUserProfileColumn,
  ensureBusinessSchema,
  ensurePartenaireRequestSchema,
};
