// Rebuilds the TEST database (schema + demo data) from the SQL files in ../db/sql.
// Refuses to run unless the database name ends in "_test" - it drops and recreates every table.
//
//   npm run db:load-test
//
// Set SQL_DIR to read the SQL files from somewhere else.
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js'; // exits early if this isn't a safe *_test database
import { optionsFromUrl } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = resolve(process.env.SQL_DIR ?? join(here, '..', '..', 'db', 'sql'));

export async function loadTestDb() {
  const options = optionsFromUrl(config.databaseUrl);
  if (!options.database.endsWith('_test')) throw new Error(`Refusing to reset "${options.database}"`);

  const connection = await mysql.createConnection({ ...options, multipleStatements: true });
  try {
    for (const file of ['01_schema.sql', '02_seed.sql', '02b_seed_marketplace.sql']) {
      let sql;
      try {
        sql = await readFile(join(sqlDir, file), 'utf8');
      } catch {
        throw new Error(`Cannot read ${join(sqlDir, file)}. Is ~/School/db/sql in place? (or set SQL_DIR)`);
      }
      // The files start with "USE tsm;" - point them at the test database instead.
      if (!/^USE\s+tsm\s*;/im.test(sql)) throw new Error(`${file} has no "USE tsm;" line to redirect`);
      sql = sql.replace(/^USE\s+tsm\s*;/im, `USE \`${options.database}\`;`);
      await connection.query(sql);
    }
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadTestDb();
  console.log(`Test database "${new URL(config.databaseUrl).pathname.slice(1)}" rebuilt from ${sqlDir}`);
}
