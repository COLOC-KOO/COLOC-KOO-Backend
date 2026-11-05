const { query } = require('./db.service');

async function ensureJournalSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS journal_actions (
      id_action INT NOT NULL AUTO_INCREMENT,
      id_utilisateur INT NULL,
      action VARCHAR(80) NOT NULL,
      cible_type VARCHAR(80) NULL,
      cible_id INT NULL,
      details JSON NULL,
      date_action DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_action),
      KEY idx_journal_action_date (date_action),
      KEY idx_journal_action_type (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function insertJournalAction(execute, userId, action, cibleType, cibleId, details = null) {
  await execute(
    `INSERT INTO journal_actions (id_utilisateur, action, cible_type, cible_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId || null, action, cibleType, cibleId || null, details ? JSON.stringify(details) : null]
  );
}

async function logAction(userId, action, cibleType, cibleId, details = null) {
  await ensureJournalSchema();
  await insertJournalAction(query, userId, action, cibleType, cibleId, details);
}

module.exports = { ensureJournalSchema, insertJournalAction, logAction };
