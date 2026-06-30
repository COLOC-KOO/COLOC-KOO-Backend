const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');

const corsMiddleware = require('./Middleware/cors.middleware');
const routes = require('./Routes');
const { notFound, errorHandler } = require('./Middleware/error.middleware');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
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
