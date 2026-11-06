// SC-080 — Reprise des annonces existantes : fusionne les villes en double
// (casse, espaces, alias type « Tana ») et repointe automatiquement toutes les
// tables qui référencent villes.id_ville avant de supprimer les doublons.
//
// Usage :
//   node scripts/harmoniser-villes.js           → dry-run (rapport seul)
//   node scripts/harmoniser-villes.js --apply   → applique la fusion
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/Config/connectDatabase');

const ALIASES = {
  'tana': 'Antananarivo',
  'tananarive': 'Antananarivo',
  'tananarivo': 'Antananarivo',
};

const normalize = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] || key;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = await getPool();

  const [villes] = await pool.query('SELECT id_ville, nom_ville FROM villes ORDER BY id_ville');
  const groups = new Map();
  for (const ville of villes) {
    const key = normalize(ville.nom_ville);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ville);
  }

  const duplicates = [...groups.values()].filter((group) => group.length > 1);
  if (duplicates.length === 0) {
    console.log('Aucun doublon de ville a fusionner.');
    await pool.end();
    return;
  }

  const [fks] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME = 'villes'
       AND REFERENCED_TABLE_SCHEMA = DATABASE()`
  );

  console.log(`Fusions detectees : ${duplicates.length}`);
  for (const group of duplicates) {
    const [keep, ...drop] = group;
    const dropIds = drop.map((v) => v.id_ville);
    console.log(`  • « ${keep.nom_ville} » (id ${keep.id_ville}) <- ${drop.map((v) => `${v.nom_ville} (id ${v.id_ville})`).join(', ')}`);

    if (!apply) continue;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const id of dropIds) {
        for (const fk of fks) {
          if (fk.TABLE_NAME === 'villes') continue;
          await connection.execute(
            `UPDATE \`${fk.TABLE_NAME}\` SET \`${fk.COLUMN_NAME}\` = ? WHERE \`${fk.COLUMN_NAME}\` = ?`,
            [keep.id_ville, id]
          );
        }
        await connection.execute('DELETE FROM villes WHERE id_ville = ?', [id]);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback().catch(() => {});
      throw err;
    } finally {
      connection.release();
    }
  }

  if (!apply) {
    console.log('\nDry-run : aucune modification. Relancer avec --apply pour fusionner.');
  } else {
    console.log('\nFusion appliquee.');
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Echec de l\'harmonisation des villes :', err.message);
  process.exitCode = 1;
});
