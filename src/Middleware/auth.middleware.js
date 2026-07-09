const jwt = require('jsonwebtoken');

const ROLE_ALIASES = {
  superadmin: 'super_admin',
  super_admin: 'super_admin',
  admin: 'admin',
  moderateur: 'moderator',
  moderator: 'moderator',
  proprietaire: 'proprio',
  proprio: 'proprio',
  colocataire: 'coloc',
  coloc: 'coloc',
};

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').trim()] || role;
}

function normalizeUserId(value) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
}

function buildAuthenticatedUser(payload) {
  return {
    ...payload,
    id: normalizeUserId(payload.id || payload.id_utilisateur || payload.userId || payload.sub),
    email: payload.email,
    nom: payload.nom,
    prenom: payload.prenom,
    role: payload.role || payload.poste,
    poste: payload.poste || payload.role,
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token manquant.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.user = buildAuthenticatedUser(payload);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expire.' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.user = buildAuthenticatedUser(payload);
  } catch (error) {
    // Ignore invalid token for optional auth.
  }

  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifie.' });
    }

    const allowed = roles.map(normalizeRole);
    const userRole = normalizeRole(req.user.role || req.user.poste);

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ message: 'Acces refuse.' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole, normalizeRole, optionalAuth };
