const { getPool } = require('../Config/connectDatabase');

async function query(sql, params = []) {
  const pool = await getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function insertAndGetId(sql, params = []) {
  const pool = await getPool();
  const [result] = await pool.execute(sql, params);
  return result.insertId;
}

// Exécute `fn(tx)` dans une transaction : tout est validé, ou rien (rollback).
// `tx(sql, params)` s'utilise comme `query`, mais sur la connexion de la transaction.
async function withTransaction(fn) {
  const pool = await getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tx = async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    };
    const result = await fn(tx);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { query, insertAndGetId, withTransaction };
