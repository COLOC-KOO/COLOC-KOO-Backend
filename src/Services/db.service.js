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

module.exports = { query, insertAndGetId };
