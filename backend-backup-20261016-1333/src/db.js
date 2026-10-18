// One shared MySQL connection pool. Everything is stored and read in UTC.
import mysql from 'mysql2/promise';
import { config } from './config.js';

function optionsFromUrl(urlString) {
  const u = new URL(urlString);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
    charset: 'UTF8MB4_0900_AI_CI', // same collation as the tables: case + accent insensitive
    timezone: 'Z',
    connectionLimit: 10,
    waitForConnections: true,
    // DECIMAL columns come back as strings ("124.99"); lib/money.js turns them into cents exactly.
    decimalNumbers: false,
  };
}

export const pool = mysql.createPool(optionsFromUrl(config.databaseUrl));

// Make every connection use UTC for NOW(), CURRENT_TIMESTAMP, etc.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

/** Run several statements as one all-or-nothing unit. */
export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function closePool() {
  await pool.end();
}

export { optionsFromUrl };
