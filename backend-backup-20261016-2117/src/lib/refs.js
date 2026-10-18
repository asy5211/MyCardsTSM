// Human-friendly reference numbers (TSM-7K3M9QXA, SUB-482913, SUP-205518) that are checked for uniqueness by the database.
import { randomBytes, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, so they are easy to read out loud

export function newOrderNumber() {
  return `TSM-${[...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}
export const newTicketNumber = () => `SUB-${randomInt(100000, 1000000)}`;
export const newSupportRef = () => `SUP-${randomInt(100000, 1000000)}`;

/**
 * Runs `attempt(ref)` (one INSERT) with a fresh reference, trying again if the database says that reference exists.
 * An INSERT that fails on a duplicate key leaves a transaction usable, so this is safe inside one.
 */
export async function withUniqueRef(make, attempt, tries = 6) {
  for (let i = 1; ; i++) {
    const ref = make();
    try {
      return await attempt(ref);
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY' && i < tries) continue;
      throw err;
    }
  }
}
