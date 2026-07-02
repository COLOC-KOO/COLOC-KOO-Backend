const dotenv = require('dotenv');
dotenv.config();

const { createApp } = require('./app');
const { testConnection, ensureUserProfileColumn } = require('./Config/connectDatabase');

const PORT = process.env.PORT || 5000;
const app = createApp();

async function start() {
  await testConnection();
  await ensureUserProfileColumn();

  const server = app.listen(PORT, () => {
    console.log(`Serveur demarre sur le port ${PORT}`);
  });

  process.on('unhandledRejection', err => {
    console.error('Erreur non geree:', err);
    server.close(() => process.exit(1));
  });

  process.on('uncaughtException', err => {
    console.error('Erreur non geree:', err);
    server.close(() => process.exit(1));
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('Impossible de demarrer le serveur:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
