const bcrypt = require('bcryptjs');
const { query, insertAndGetId } = require('../Services/db.service');
const { signToken } = require('../Services/token.service');
const { mapUserRow } = require('../Services/mappers');

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

async function register(req, res, next) {
  try {
    const {
      email,
      mot_de_passe,
      nom,
      prenom,
      telephone = null,
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
       (email, telephone, mot_de_passe, nom, prenom, age, bio, profession, id_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, telephone, hash, nom, prenom, age, bio, profession, roleId]
    );

    const user = await getUserById(id);
    const token = signToken(user);

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
    const token = signToken(user);
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
    const allowed = ['email', 'nom', 'prenom', 'telephone', 'bio', 'profession', 'profile_picture', 'langue_preferee', 'navigation_light'];
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

module.exports = { register, login, me, updateMe, uploadProfilePicture, changePassword };
