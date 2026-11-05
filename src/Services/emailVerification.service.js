const crypto = require('crypto');
const { query } = require('./db.service');
const mail = require('./mail.service');

let schemaPromise;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      try {
        await query(
          "ALTER TABLE utilisateurs ADD COLUMN email_verifie TINYINT(1) NOT NULL DEFAULT 1"
        );
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      }

      await query(`
        CREATE TABLE IF NOT EXISTS email_verifications (
          id_utilisateur INT NOT NULL PRIMARY KEY,
          token_hash CHAR(64) NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_email_verifications_token (token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function createVerification(userId, email, firstName) {
  await ensureSchema();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query(
    `INSERT INTO email_verifications (id_utilisateur, token_hash, expires_at, created_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())
     ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), created_at = NOW()`,
    [userId, tokenHash]
  );

  const link = `/auth?verificationToken=${encodeURIComponent(token)}`;
  const safeFirstName = String(firstName || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
  const sent = await mail.sendEmail(
    email,
    "Confirme ton adresse e-mail - Coloc'KOO",
    mail.wrapLayout(
      'Confirme ton adresse e-mail',
      `<p>Bonjour ${safeFirstName},</p>
       <p>Pour activer ton compte Coloc'KOO, confirme ton adresse e-mail en cliquant sur le bouton ci-dessous. Ce lien expire dans 24 heures.</p>
       ${mail.actionButton('Confirmer mon adresse e-mail', link)}`
    ),
    `Bonjour ${firstName}, confirme ton adresse e-mail en ouvrant : ${mail.appBaseUrl()}${link}`
  );
  if (!sent) {
    await query('DELETE FROM email_verifications WHERE id_utilisateur = ?', [userId]);
  }
  return sent;
}

async function verifyToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
  await ensureSchema();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await query(
    `SELECT id_utilisateur
     FROM email_verifications
     WHERE token_hash = ? AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows.length) return false;

  await query('UPDATE utilisateurs SET email_verifie = 1 WHERE id_utilisateur = ?', [rows[0].id_utilisateur]);
  await query('DELETE FROM email_verifications WHERE id_utilisateur = ?', [rows[0].id_utilisateur]);
  return true;
}

module.exports = { createVerification, ensureSchema, verifyToken };
