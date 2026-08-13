const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, insertAndGetId } = require('../Services/db.service');
const { signToken } = require('../Services/token.service');
const { mapUserRow } = require('../Services/mappers');
const mail = require('../Services/mail.service');

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

async function resolveRoleId(posteOrRole) {
  const normalized = ROLE_ALIASES[String(posteOrRole || 'colocataire').trim()] || 'coloc';
  const rows = await query('SELECT id_role FROM roles WHERE nom_role = ? LIMIT 1', [normalized]);
  return rows[0]?.id_role || 1;
}

// Detecte le type d'appareil + libelle a partir du User-Agent
function detectDevice(userAgent) {
  const ua = String(userAgent || '');
  const isMobile = /android|iphone|ipod|mobile/i.test(ua);

  let os = 'Appareil';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Navigateur';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/chrome|chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return { type: isMobile ? 'mobile' : 'desktop', label: `${browser} / ${os}` };
}

// Cree une session en base et renvoie son session_id
// ✅ CORRECTION : remplace l'ancienne session du MEME appareil (evite les doublons)
async function createSession(userId, req) {
  const sessionId = crypto.randomUUID();
  const device = detectDevice(req.headers['user-agent']);

  // Supprime la precedente session de cet appareil avant d'en creer une nouvelle
  await query(
    'DELETE FROM sessions WHERE id_utilisateur = ? AND type_appareil = ? AND label = ?',
    [userId, device.type, device.label]
  );

  await query(
    `INSERT INTO sessions (id_utilisateur, session_id, type_appareil, label, dernier_usage)
     VALUES (?, ?, ?, ?, NOW())`,
    [userId, sessionId, device.type, device.label]
  );
  return sessionId;
}

// "il y a 3 jours", "il y a 5 min"... pour les autres appareils
function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "a l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jours`;
}

async function register(req, res, next) {
  try {
    const {
      email,
      mot_de_passe,
      nom,
      prenom,
      telephone = null,
      cin = null,
      id_role,
      poste = 'colocataire',
      age = null,
      profession = null,
      bio = null,
    } = req.body;

    if (!email || !mot_de_passe || !nom || !prenom) {
      return res.status(400).json({ message: 'Champs obligatoires manquants.' });
    }

    const exists = await query('SELECT id_utilisateur FROM utilisateurs WHERE email = ? LIMIT 1', [email]);
    if (exists.length > 0) {
      return res.status(409).json({ message: 'Cet email existe deja.' });
    }

    const roleId = id_role || (await resolveRoleId(poste));
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const id = await insertAndGetId(
      `INSERT INTO utilisateurs
       (email, telephone, cin, mot_de_passe, nom, prenom, age, bio, profession, id_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, telephone, cin, hash, nom, prenom, age, bio, profession, roleId]
    );

    const user = await getUserById(id);

    let token;
    try {
      const sessionId = await createSession(id, req);
      token = signToken(user, sessionId);
    } catch (sessionError) {
      console.warn('[auth] Session non creee:', sessionError.message);
      token = signToken(user);
    }

    try {
      await mail.sendEmail(
        email,
        "Bienvenue sur Coloc'KOO",
        mail.wrapLayout(
          "Votre compte a ete cree",
          `
            <p>Bonjour ${prenom},</p>
            <p>Votre compte Coloc'KOO est maintenant actif. Vous pouvez chercher une colocation, proposer un logement ou contacter les profils qui vous interessent.</p>
            ${mail.actionButton('Acceder a mon compte', '/compte')}
          `
        ),
        `Bonjour ${prenom}, votre compte Coloc'KOO a ete cree.`
      );
    } catch (error) {
      console.warn('[auth] Email de bienvenue non envoye:', error.message);
    }

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, mot_de_passe } = req.body;
    if (!email || !mot_de_passe) {
      return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }

    const rows = await query(
      `SELECT u.*, r.nom_role
       FROM utilisateurs u
       JOIN roles r ON r.id_role = u.id_role
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    const userRow = rows[0];
    const ok = await bcrypt.compare(mot_de_passe, userRow.mot_de_passe);
    if (!ok) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    const user = mapUserRow(userRow);

    let token;
    try {
      const sessionId = await createSession(user.id, req);
      token = signToken(user, sessionId);
    } catch (sessionError) {
      console.warn('[auth] Session non creee:', sessionError.message);
      token = signToken(user);
    }

    await query('UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id_utilisateur = ?', [user.id]);

    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await getUserById(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const allowed = ['email', 'nom', 'prenom', 'telephone', 'cin', 'bio', 'profession', 'profile_picture', 'langue_preferee', 'navigation_light'];
    const pairs = [];
    const values = [];

    const body = req.body || {};

    if (body.date_naissance !== undefined) {
      const rawValue = body.date_naissance;
      let birthDate = null;
      if (typeof rawValue === 'string' && rawValue.trim()) {
        const parsed = new Date(rawValue);
        if (!Number.isNaN(parsed.getTime())) {
          birthDate = parsed;
        }
      } else if (rawValue instanceof Date) {
        birthDate = rawValue;
      }
      const age = birthDate ? computeAge(birthDate) : null;
      pairs.push('date_naissance = ?');
      values.push(birthDate ? birthDate.toISOString().slice(0, 10) : null);
      pairs.push('age = ?');
      values.push(age);
    }

    if (body.ville_actuelle !== undefined) {
      pairs.push('ville_actuelle = ?');
      values.push(await resolveCityId(body.ville_actuelle));
    }

    if (body.ville_origine !== undefined) {
      pairs.push('ville_origine = ?');
      values.push(await resolveCityId(body.ville_origine));
    }

    for (const key of allowed) {
      if (body[key] !== undefined) {
        const value = body[key];
        if (value === null || value === '') {
          pairs.push(`${key} = ?`);
          values.push(null);
        } else {
          pairs.push(`${key} = ?`);
          values.push(value);
        }
      }
    }

    if (pairs.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }

    values.push(req.user.id);
    await query(`UPDATE utilisateurs SET ${pairs.join(', ')} WHERE id_utilisateur = ?`, values);
    const user = await getUserById(req.user.id);
    res.json(user);
  } catch (err) {
    console.error('updateMe error', err);
    res.status(500).json({ message: 'Impossible de mettre à jour le profil.' });
  }
}

async function resolveCityId(cityValue) {
  if (cityValue === null || cityValue === undefined || cityValue === '') return null;
  if (typeof cityValue === 'number' && Number.isInteger(cityValue)) return cityValue;
  const text = String(cityValue).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const rows = await query('SELECT id_ville FROM villes WHERE LOWER(nom_ville) = LOWER(?) LIMIT 1', [text]);
  return rows[0]?.id_ville ?? null;
}

function computeAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return Math.max(0, age);
}

async function uploadProfilePicture(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucune image reçue.' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const profilePicture = `${baseUrl}/uploads/${req.file.filename}`;
    await query('UPDATE utilisateurs SET profile_picture = ? WHERE id_utilisateur = ?', [profilePicture, req.user.id]);
    const user = await getUserById(req.user.id);
    res.status(201).json({ profilePicture, user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { mot_de_passe_actuel, nouveau_mot_de_passe } = req.body;
    if (!mot_de_passe_actuel || !nouveau_mot_de_passe) {
      return res.status(400).json({ message: 'Mot de passe actuel et nouveau mot de passe requis.' });
    }

    const rows = await query('SELECT mot_de_passe FROM utilisateurs WHERE id_utilisateur = ? LIMIT 1', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const ok = await bcrypt.compare(mot_de_passe_actuel, rows[0].mot_de_passe);
    if (!ok) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await query('UPDATE utilisateurs SET mot_de_passe = ? WHERE id_utilisateur = ?', [hash, req.user.id]);
    res.json({ message: 'Mot de passe mis a jour.' });
  } catch (err) {
    next(err);
  }
}

async function getUserById(id) {
  const rows = await query(
    `SELECT u.*, r.nom_role,
            v_act.nom_ville AS ville_actuelle_nom,
            v_orig.nom_ville AS ville_origine_nom
     FROM utilisateurs u
     JOIN roles r ON r.id_role = u.id_role
     LEFT JOIN villes v_act ON v_act.id_ville = u.ville_actuelle
     LEFT JOIN villes v_orig ON v_orig.id_ville = u.ville_origine
     WHERE u.id_utilisateur = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }
  return mapUserRow(rows[0]);
}

async function updateSecuritySettings(req, res, next) {
  try {
    const allowed = ['two_fa_enabled', 'rgpd_analytics', 'rgpd_partenaires'];
    const pairs = [];
    const values = [];
    const body = req.body || {};

    for (const key of allowed) {
      if (body[key] !== undefined) {
        pairs.push(`${key} = ?`);
        values.push(body[key] ? 1 : 0);
      }
    }

    if (pairs.length === 0) {
      return res.status(400).json({ message: 'Aucune modification fournie.' });
    }

    values.push(req.user.id);
    await query(`UPDATE utilisateurs SET ${pairs.join(', ')} WHERE id_utilisateur = ?`, values);

    const user = await getUserById(req.user.id);
    res.json({ message: 'Parametres mis a jour.', user });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.id;

    await query('DELETE FROM sessions WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM favoris WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM candidatures WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM recherches_sauvegardees WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM notifications WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM messages WHERE id_expediteur = ? OR id_destinataire = ?', [userId, userId]);
    await query('DELETE FROM depot_annonce WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM annonces WHERE id_utilisateur = ?', [userId]);
    await query('DELETE FROM utilisateurs WHERE id_utilisateur = ?', [userId]);

    res.json({ message: 'Compte supprime definitivement.' });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const rows = await query(
      `SELECT id_session, session_id, type_appareil, label, dernier_usage
       FROM sessions
       WHERE id_utilisateur = ?
       ORDER BY dernier_usage DESC`,
      [req.user.id]
    );

    const currentSessionId = req.user.session_id || null;

    const sessions = rows.map((row) => {
      const courant = currentSessionId ? row.session_id === currentSessionId : false;
      return {
        id: String(row.id_session),
        type: row.type_appareil === 'mobile' ? 'mobile' : 'desktop',
        label: row.label || 'Appareil',
        lieu: courant ? null : formatRelativeDate(row.dernier_usage),
        courant,
      };
    });

    // Token ancien (sans session) : on affiche quand meme l'appareil actuel
    if (!currentSessionId) {
      const device = detectDevice(req.headers['user-agent']);
      sessions.unshift({
        id: 'current',
        type: device.type,
        label: device.label,
        lieu: null,
        courant: true,
      });
    }

    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

async function revokeOtherSessions(req, res, next) {
  try {
    const currentSessionId = req.user.session_id || null;

    if (currentSessionId) {
      await query('DELETE FROM sessions WHERE id_utilisateur = ? AND session_id != ?', [req.user.id, currentSessionId]);
    } else {
      await query('DELETE FROM sessions WHERE id_utilisateur = ?', [req.user.id]);
    }

    res.json({ message: 'Autres appareils deconnectes.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  me,
  updateMe,
  uploadProfilePicture,
  changePassword,
  updateSecuritySettings,
  deleteAccount,
  listSessions,
  revokeOtherSessions
};
