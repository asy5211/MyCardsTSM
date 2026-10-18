// Tiny logger. Silent during tests unless DEBUG_TESTS=1.
import { config } from './config.js';

const quiet = config.isTest && !process.env.DEBUG_TESTS;

function write(level, message, meta) {
  if (quiet) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' ? console.error : console.log;
  if (meta === undefined) out(line);
  else out(line, meta);
}

export const logger = {
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
};
