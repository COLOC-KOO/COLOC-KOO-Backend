// src/Config/connectDatabase.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuration de la connexion
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coloc',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

const getPool = () => pool;

// Fonction pour tester la connexion
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connecté à la base de données MySQL');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Erreur de connexion à la base de données:', error.message);
        return false;
    }
}

// Exporter correctement avec module.exports
module.exports = {
    pool,
    testConnection,
    getPool
};