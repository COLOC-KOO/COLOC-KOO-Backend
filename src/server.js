/* Server */
const dotenv = require('dotenv');
dotenv.config();
const { demarrerCronExpireJ7 } = require('./Cron/expireJ7.cron');
const { demarrerCronExpired } = require('./Cron/expired.cron');
const { createApp } = require('./app');
const { testConnection, ensureUserProfileColumn, ensureBusinessSchema, ensurePartenaireRequestSchema } = require('./Config/connectDatabase');
const { attachRealtime } = require('./Services/realtime.service');

const PORT = process.env.PORT || 4000;
const app = createApp();

// ✅ Les routes des alertes sont maintenant dans app.js
// (avant le middleware notFound, pour qu'elles soient bien atteignables)

async function listenWithFallback(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Serveur demarre sur le port ${port}`);
      resolve(server);
    });

    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.warn(`Port ${port} indisponible, tentative sur ${nextPort}...`);
        server.close(() => resolve(listenWithFallback(nextPort)));
        return;
      }

      reject(err);
    });
  });
}

async function start() {
  await testConnection();
  await ensureUserProfileColumn();
  await ensureBusinessSchema();
  await ensurePartenaireRequestSchema();

  const server = await listenWithFallback(PORT);
  app.set('realtime', attachRealtime(server));

  // Démarre les tâches planifiées (cron) une fois le serveur bien lancé
  demarrerCronExpireJ7();
  demarrerCronExpired();

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