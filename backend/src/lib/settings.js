// Numbers an admin can change without a new release (table platform_settings).
//   tsm_fee_bps         TSM's flat cut of each sale, in basis points (500 = 5.00%)
//   processing_fee_bps  the payment / Apple fee taken from each sale, in basis points (0 until an admin sets it)
// A sale remembers the rates it was made at (seller_earnings.commission_bps / processing_fee_bps), so changing a rate
// never rewrites history: a sale made at 5% + 10% stays at 5% + 10% whatever the rates are later.
// There is no preset ceiling on either rate (they are dynamic). The only rule is the one that keeps the money sane:
// the two together can never be more than 100% of a sale, or the seller's share would go negative.
import { config } from '../config.js';
import { pool } from '../db.js';

/** Both fees together cannot take more than the whole sale (10000 basis points = 100%). */
export const MAX_TOTAL_FEE_BPS = 10000;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** The rates that apply to a sale made right now. */
export async function getFees(executor = pool) {
  const [rows] = await executor.query(
    "SELECT setting_key, value_int FROM platform_settings WHERE setting_key IN ('tsm_fee_bps', 'processing_fee_bps')",
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.setting_key, Number(r.value_int)]));
  const tsmFeeBps = byKey.tsm_fee_bps ?? config.commissionBps;
  const processingFeeBps = byKey.processing_fee_bps ?? 0;
  return { tsmFeeBps, processingFeeBps, totalBps: tsmFeeBps + processingFeeBps };
}

/** Same rates plus who changed them last and when (for the admin Settings page). */
export async function getFeeSettings(executor = pool) {
  const fees = await getFees(executor);
  const [[last]] = await executor.query(
    `SELECT s.updated_at, st.name AS updated_by
       FROM platform_settings s LEFT JOIN admin_staff st ON st.id = s.updated_by_staff_id
      WHERE s.setting_key IN ('tsm_fee_bps', 'processing_fee_bps')
      ORDER BY s.updated_at DESC LIMIT 1`,
  );
  return { ...fees, updatedAt: iso(last?.updated_at), updatedBy: last?.updated_by ?? null };
}

export async function saveFees({ tsmFeeBps, processingFeeBps }, staffId, executor = pool) {
  const write = (key, value) =>
    executor.query(
      `INSERT INTO platform_settings (setting_key, value_int, updated_by_staff_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value_int = VALUES(value_int), updated_by_staff_id = VALUES(updated_by_staff_id)`,
      [key, value, staffId],
    );
  if (tsmFeeBps !== undefined) await write('tsm_fee_bps', tsmFeeBps);
  if (processingFeeBps !== undefined) await write('processing_fee_bps', processingFeeBps);
}

/** 500 -> "5%", 275 -> "2.75%" */
export function percentLabel(bps) {
  return `${Number((bps / 100).toFixed(2))}%`;
}
