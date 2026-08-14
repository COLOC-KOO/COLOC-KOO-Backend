const jwt = require('jsonwebtoken');
const { query } = require('../Services/db.service');

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

// ✅ Verifie que la session existe encore en base (sinon = deconnectee)
async function isSessionValid(sessionId, userId) {
  if (!sessionId) return true; // ancien token sans session : on laisse passer
  const rows = await query(
    'SELECT id_session FROM sessions WHERE session_id = ? AND id_utilisateur = ? LIMIT 1',
    [sessionId, userId]
  );
  return rows.length > 0;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token manquant.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.user = buildAuthenticatedUser(payload);

    // ✅ Controle de session : si la session a ete revoquee, on refuse
    if (payload.session_id) {
      const valid = await isSessionValid(payload.session_id, req.user.id);
      if (!valid) {
        return res.status(401).json({ message: 'Session expiree ou deconnectee.' });
      }
      // Met a jour la derniere activite de l'appareil
      await query('UPDATE sessions SET dernier_usage = NOW() WHERE session_id = ?', [payload.session_id]).catch(() => {});
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expire.' });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    const user = buildAuthenticatedUser(payload);

    if (payload.session_id) {
      const valid = await isSessionValid(payload.session_id, user.id);
      if (valid) req.user = user;
    } else {
      req.user = user;
    }
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
