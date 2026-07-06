const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const corsMiddleware = require('./Middleware/cors.middleware');
const routes = require('./Routes');
const { notFound, errorHandler } = require('./Middleware/error.middleware');

function createApp() {
  const app = express();
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use('/uploads', express.static(uploadsDir));
  app.use(morgan('dev'));

  app.get('/', (req, res) => {
    res.json({
      message: 'API ColocKOO active',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
