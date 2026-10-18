import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool, pool } from './db.js';
import { logger } from './logger.js';

try {
  await pool.query('SELECT 1');
} catch (err) {
  const where = new URL(config.databaseUrl);
  console.error(
    `\nCannot reach MySQL at ${where.hostname}:${where.port || 3306} (${err.code ?? err.message}).\n` +
      '  - Is the MySQL server running?\n' +
      '  - Do the user/password/database in DATABASE_URL (backend/.env) match db/sql/00_create_database_and_user.sql?\n',
  );
  process.exit(1);
}

const app = buildApp();
const server = app.listen(config.port, () => {
  logger.info(`TSM API listening on http://localhost:${config.port}  (${config.env})`);
});

async function shutdown(signal) {
  logger.info(`${signal} received - shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
