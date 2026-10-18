// One conversation engine for every kind of thread: sell-to-us tickets, order chats between a buyer and a seller,
// and support requests. A thread is just (kind, id); each route decides who may read and write it.
import { pool } from '../db.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export const MESSAGE_MAX = 2000;

/** `viewerTypes`: which sender types count as "me" for the person asking (e.g. ['user'] for a buyer, ['seller'] for a seller). */
export function messageDto(row, viewerTypes = []) {
  return {
    id: Number(row.id),
    senderType: row.sender_type,
    senderName: row.sender_name,
    body: row.body,
    kind: row.msg_kind,
    amountCents: row.amount_cents === null || row.amount_cents === undefined ? null : Number(row.amount_cents),
    mine: viewerTypes.includes(row.sender_type),
    createdAt: iso(row.created_at),
  };
}

export async function listMessages(kind, threadId, viewerTypes = [], executor = pool) {
  const [rows] = await executor.query(
    'SELECT * FROM messages WHERE thread_kind = ? AND thread_id = ? ORDER BY id ASC LIMIT 500',
    [kind, threadId],
  );
  return rows.map((r) => messageDto(r, viewerTypes));
}

/** Adds one message and returns it. Pass a transaction connection as `executor` to make it part of a bigger change. */
export async function addMessage(
  { kind, threadId, senderType, senderId = null, senderName, body, msgKind = 'text', amountCents = null },
  executor = pool,
) {
  const [result] = await executor.query(
    `INSERT INTO messages (thread_kind, thread_id, sender_type, sender_id, sender_name, body, msg_kind, amount_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [kind, threadId, senderType, senderId, String(senderName).slice(0, 80), body, msgKind, amountCents],
  );
  const [[row]] = await executor.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
  return row;
}

export async function countMessages(kind, threadId, executor = pool) {
  const [[row]] = await executor.query('SELECT COUNT(*) AS n FROM messages WHERE thread_kind = ? AND thread_id = ?', [kind, threadId]);
  return Number(row.n);
}
