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

async function ensureAnnoncePhotoColumn() {
  try {
    const dbPool = await initPool();
    const [photoColumns] = await dbPool.query("SHOW COLUMNS FROM photos_annonces LIKE 'url'");
    if (photoColumns.length > 0) {
      const type = String(photoColumns[0].Type || '').toUpperCase();
      if (!type.includes('TEXT')) {
        await dbPool.query('ALTER TABLE photos_annonces MODIFY COLUMN url MEDIUMTEXT NOT NULL');
      }
    }
  } catch (error) {
    console.warn('Impossible d’ajuster la colonne des photos d’annonce:', error.message);
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
  ensureAnnoncePhotoColumn,
};
