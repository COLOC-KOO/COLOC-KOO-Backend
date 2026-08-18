const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const corsMiddleware = require('./Middleware/cors.middleware');
const routes = require('./Routes');
const { notFound, errorHandler } = require('./Middleware/error.middleware');
const candidatureRoutes = require('./Routes/candidatures.routes');
const contratsRoutes = require('./Routes/contrats.route');

// NOUVEL IMPORT : contrôleur des alertes
const { getAlertes, createAlerte, deleteAlerte } = require('./Controllers/alertes.controller.js');

// NOUVEL IMPORT : contrôleur des préférences de notification
const { getPreferences, updatePreferences } = require('./Controllers/preferences.controller.js');

function createApp() {
  const app = express();
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  //  Appliquer CORS à toutes les routes
  app.use(corsMiddleware);
  
  //  Configuration Helmet pour permettre les ressources cross-origin
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  }));
  
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  
  //  Middleware spécifique pour les fichiers statiques avec CORS
  const staticCorsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  };
  
  app.use('/uploads', staticCorsMiddleware, express.static(uploadsDir, {
    setHeaders: (res, path, stat) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }));
  
  app.use('/public/uploads', staticCorsMiddleware, express.static(uploadsDir, {
    setHeaders: (res, path, stat) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }));

  app.use('/api/candidatures', candidatureRoutes);
  app.use('/api/contrats', contratsRoutes);
  
  app.use(morgan('dev'));

  app.get('/', (req, res) => {
    res.json({
      message: 'API ColocKOO active',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', routes);

  app.get('/api/geocode/health', (req, res) => {
    res.json({ ok: true, source: 'geocode-proxy-ready' });
  });

  // NOUVELLES ROUTES : alertes (AVANT le notFound !)
  app.get('/api/alertes/:idUtilisateur', getAlertes);
  app.post('/api/alertes', createAlerte);
  app.delete('/api/alertes/:id', deleteAlerte);

  // NOUVELLES ROUTES : préférences de notification (AVANT le notFound !)
  app.get('/api/preferences/:idUtilisateur', getPreferences);
  app.put('/api/preferences/:idUtilisateur', updatePreferences);

  // ⚠️ Ces deux middlewares DOIVENT rester en dernier
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };