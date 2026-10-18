// TSM's own storefront ("house seller").
//
// An admin can post TSM's own product exactly like a seller does (price, stock, where it came from, box or loose).
// To reuse everything sellers already have (orders, shipping, reviews, the shop page) TSM gets one seller profile of its own,
// flagged is_house = 1. Its listings:
//   * always sit at the top of a product's offers, whatever they cost, and the app draws them with a purple border;
//   * take no TSM fee and are never paid out (TSM is not paying itself), so they write nothing to the earnings ledger;
//   * cannot be logged into: the backing user row is suspended and has no usable password.
//
// The row is created the first time it is needed, so it survives the demo seed script (which empties the users table).
import { config } from '../config.js';
import { pool } from '../db.js';

export const HOUSE_SELLER_ID = '00000000-0000-4000-8000-000000000001';
export const HOUSE_NAME = 'TSM';

let known = null; // the id once we have seen it exists (cleared by tests that rebuild the database)

export function forgetHouseSeller() {
  known = null;
}

/** Makes sure TSM's storefront exists and returns its seller id. Safe to call any number of times, even at the same moment. */
export async function ensureHouseSeller(executor = pool) {
  if (known) {
    const [[still]] = await executor.query('SELECT user_id FROM seller_profiles WHERE user_id = ? AND is_house = 1', [known]);
    if (still) return known;
    known = null;
  }
  const [[existing]] = await executor.query('SELECT user_id FROM seller_profiles WHERE is_house = 1 LIMIT 1');
  if (existing) {
    known = existing.user_id;
    return known;
  }
  // The username has a space in it, which sign-up does not allow, so nobody can ever register it.
  await executor.query(
    `INSERT IGNORE INTO users (id, username, email, password_hash, status, terms_accepted_at, terms_version)
     VALUES (?, 'TSM Official', 'tsm-official@tsm.invalid', '!', 'suspended', NOW(3), ?)`,
    [HOUSE_SELLER_ID, config.termsVersion],
  );
  for (const name of [HOUSE_NAME, 'TSM Official', 'TSM (official store)']) {
    try {
      await executor.query(
        `INSERT INTO seller_profiles (user_id, display_name, status, is_house, approved_at)
         VALUES (?, ?, 'active', 1, NOW(3))`,
        [HOUSE_SELLER_ID, name],
      );
      break;
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY') throw err;
      // Someone created it a moment ago (primary key): done. Otherwise that display name belongs to a real seller: try the next one.
      if (String(err.sqlMessage).includes('PRIMARY')) break;
    }
  }
  const [[row]] = await executor.query('SELECT user_id FROM seller_profiles WHERE is_house = 1 LIMIT 1');
  known = row.user_id;
  return known;
}
