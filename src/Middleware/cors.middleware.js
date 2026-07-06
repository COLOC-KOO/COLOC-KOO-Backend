const cors = require('cors');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173,http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

module.exports = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origine CORS non autorisee'));
  },
  credentials: true,
});
