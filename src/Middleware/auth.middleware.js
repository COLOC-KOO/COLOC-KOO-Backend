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

// function requireAuth(req, res, next) {
//   const header = req.headers.authorization || '';
//   const token = header.startsWith('Bearer ') ? header.slice(7) : null;

//   if (!token) {
//     return res.status(401).json({ message: 'Token manquant.' });
//   }

//   try {
//     const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
//     req.user = payload;
//     return next();
//   } catch (error) {
//     return res.status(401).json({ message: 'Token invalide ou expire.' });
//   }
// }



function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  console.log("🔑 Header Authorization:", header ? 'Présent' : 'Absent');
  console.log("🔑 Token:", token ? token.substring(0, 20) + '...' : 'Absent');

  if (!token) {
    console.log("❌ Token manquant");
    return res.status(401).json({ message: 'Token manquant.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    console.log("✅ Payload décodé:", payload);
    
    // 🔥 CORRECTION : Normaliser l'ID utilisateur
    req.user = {
      id: payload.id || payload.id_utilisateur || payload.userId || payload.sub,
      email: payload.email,
      nom: payload.nom,
      prenom: payload.prenom,
      role: payload.role || payload.poste,
      poste: payload.poste || payload.role,
      ...payload // Garder les autres propriétés
    };
    
    console.log("✅ req.user normalisé:", req.user);
    return next();
  } catch (error) {
    console.error("❌ Erreur token:", error.message);
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
    req.user = {
      id: payload.id || payload.id_utilisateur || payload.userId || payload.sub,
      email: payload.email,
      nom: payload.nom,
      prenom: payload.prenom,
      role: payload.role || payload.poste,
      poste: payload.poste || payload.role,
      ...payload
    };
  } catch (error) {
    // Ignorer l'erreur
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifie.' });
    }

    const userRole = req.user.role || req.user.poste;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: 'Acces refuse.' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole, optionalAuth };

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
    req.user = payload;
  } catch (error) {
    // ignore invalid token for optional auth
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifie.' });
    }

    const allowed = roles.map(normalizeRole);
    if (!allowed.includes(normalizeRole(req.user.role))) {
      return res.status(403).json({ message: 'Acces refuse.' });
    }

    return next();
  };
}

module.exports = { requireAuth, requireRole, normalizeRole, optionalAuth };
