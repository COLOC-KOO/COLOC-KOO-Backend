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

function createApp() {
  const app = express();
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  // ✅ Appliquer CORS à toutes les routes
  app.use(corsMiddleware);
  
  // ✅ Configuration Helmet pour permettre les ressources cross-origin
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  }));
  
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  
  // ✅ Middleware spécifique pour les fichiers statiques avec CORS
  const staticCorsMiddleware = (req, res, next) => {
    // Ajouter les en-têtes CORS pour les fichiers statiques
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    
    // Répondre aux requêtes OPTIONS
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  };
  
  // ✅ Appliquer le middleware CORS aux fichiers statiques
  app.use('/uploads', staticCorsMiddleware, express.static(uploadsDir, {
    setHeaders: (res, path, stat) => {
      // Ajouter les en-têtes CORS pour chaque fichier
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }));
  
  // ✅ Rediriger /public/uploads vers /uploads
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

  // expose api routes under /api
  app.use('/api', routes);

  // lightweight geocode health route for quick check
  app.get('/api/geocode/health', (req, res) => {
    res.json({ ok: true, source: 'geocode-proxy-ready' });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
