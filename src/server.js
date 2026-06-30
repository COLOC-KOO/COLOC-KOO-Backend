const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de base
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de test
app.get('/', (req, res) => {
    res.json({
        message: '🚀 API fonctionne!',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Démarrer le serveur
const server = app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════');
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📚 API disponible sur: http://localhost:${PORT}`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log('═══════════════════════════════════════════════════');
});

// Gestion des erreurs
process.on('unhandledRejection', (err) => {
    console.error('❌ Erreur non gérée:', err);
    server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
    console.error('❌ Erreur non gérée:', err);
    server.close(() => process.exit(1));
});

module.exports = server;