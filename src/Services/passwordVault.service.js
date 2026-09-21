const crypto = require('crypto');

/**
 * Coffre a mots de passe.
 *
 * Le hash bcrypt de la colonne `mot_de_passe` reste la seule reference pour la
 * connexion : il est a sens unique et n'est jamais touche ici. Ce service gere
 * une SECONDE copie, chiffree et reversible, uniquement pour que le proprietaire
 * du compte puisse reafficher son mot de passe en clair depuis son espace.
 *
 * La copie est chiffree en AES-256-GCM avec une cle qui vit dans le .env, donc
 * en dehors de la base : un dump SQL seul ne suffit pas a la dechiffrer.
 * Si PASSWORD_VAULT_KEY est absente ou invalide, le coffre se desactive
 * silencieusement (chiffrer renvoie null, dechiffrer renvoie null) et le reste
 * de l'application continue de fonctionner normalement.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, taille recommandee pour GCM
const KEY_LENGTH = 32; // 256 bits

function getKey() {
  const raw = process.env.PASSWORD_VAULT_KEY;
  if (!raw) return null;

  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  return key.length === KEY_LENGTH ? key : null;
}

function isEnabled() {
  return getKey() !== null;
}

/**
 * Chiffre un mot de passe en clair.
 * @returns {string|null} "iv:tag:donnees" en base64, ou null si le coffre est inactif.
 */
function encrypt(plainPassword) {
  const key = getKey();
  if (!key || !plainPassword) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainPassword), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * Dechiffre une valeur produite par encrypt().
 * @returns {string|null} le mot de passe en clair, ou null si impossible.
 */
function decrypt(stored) {
  const key = getKey();
  if (!key || !stored) return null;

  try {
    const [ivB64, tagB64, dataB64] = String(stored).split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;

    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (err) {
    // Cle changee, donnee corrompue ou alteree : on ne fait pas echouer l'appelant.
    console.warn('[passwordVault] Dechiffrement impossible:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt, isEnabled };
