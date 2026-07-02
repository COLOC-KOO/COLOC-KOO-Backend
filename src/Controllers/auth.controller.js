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

    if (req.body.date_naissance !== undefined) {
      const birthDate = req.body.date_naissance ? new Date(req.body.date_naissance) : null;
      const age = birthDate && !Number.isNaN(birthDate.getTime())
        ? computeAge(birthDate)
        : null;
      pairs.push('date_naissance = ?');
      values.push(birthDate ? birthDate.toISOString().slice(0, 10) : null);
      pairs.push('age = ?');
      values.push(age);
    }

    if (req.body.ville_actuelle !== undefined) {
      pairs.push('ville_actuelle = ?');
      values.push(await resolveCityId(req.body.ville_actuelle));
    }

    if (req.body.ville_origine !== undefined) {
      pairs.push('ville_origine = ?');
      values.push(await resolveCityId(req.body.ville_origine));
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        pairs.push(`${key} = ?`);
        values.push(req.body[key]);
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
    next(err);
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
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
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
    `SELECT u.*, r.nom_role
     FROM utilisateurs u
     JOIN roles r ON r.id_role = u.id_role
     WHERE u.id_utilisateur = ?
     LIMIT 1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }
  return mapUserRow(rows[0]);
}

module.exports = { register, login, me, updateMe, changePassword };
