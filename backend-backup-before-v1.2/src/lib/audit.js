import { pool } from '../db.js';
import { logger } from '../logger.js';

/**
 * Append a row to audit_logs. Never throws: a logging failure must not break the action being logged.
 * `executor` can be the pool or a transaction connection.
 */
export async function audit(
  { actorType, actorId = null, action, entityType, entityId = null, details = null, ip = null },
  executor = pool,
) {
  try {
    await executor.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actorType, actorId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip],
    );
  } catch (err) {
    logger.error(`audit log write failed for ${action}`, err);
  }
}
