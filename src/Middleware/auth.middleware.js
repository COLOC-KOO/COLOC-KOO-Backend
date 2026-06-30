const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token manquant.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expire.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifie.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acces refuse.' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole };
