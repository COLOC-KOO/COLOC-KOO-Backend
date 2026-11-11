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

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expire.' });
  }

  req.user = buildAuthenticatedUser(payload);

  if (payload.session_id) {
    const valid = await isSessionValid(payload.session_id, req.user.id);
    if (!valid) {
      return res.status(401).json({ message: 'Session expiree ou deconnectee.' });
    }
    await query('UPDATE sessions SET dernier_usage = NOW() WHERE session_id = ?', [payload.session_id]).catch(() => {});
  }

  try {
    const users = await query(
      'SELECT statut FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1',
      [req.user.id]
    );
    if (!users.length) {
      return res.status(401).json({ message: 'Compte introuvable.' });
    }

    req.user.statut = users[0].statut;
    const normalizedStatus = String(users[0].statut || '').trim().toLowerCase();
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase()) &&
      ['suspended', 'suspendu', 'banned', 'banni'].includes(normalizedStatus)
    ) {
      const reasonColumn = await query(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
        ['utilisateurs', 'motif_suspension']
      );
      let suspensionReason = null;
      if (reasonColumn.length) {
        const reasons = await query(
          'SELECT motif_suspension FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1',
          [req.user.id]
        );
        suspensionReason = reasons[0]?.motif_suspension || null;
      }
      return res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Votre compte est suspendu. Vous pouvez consulter les annonces et candidatures existantes, mais aucune modification ni nouvelle action n’est autorisée.',
        suspensionReason,
      });
    }
  } catch (error) {
    return next(error);
  }

  return next();
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
