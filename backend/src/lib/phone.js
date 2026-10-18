// US phone numbers, always stored and shown as  +1 (555) - 123 - 4567.
// The app formats as the person types; the server checks and formats again so every phone number
// in the database looks the same no matter which app or website sent it.
import { z } from 'zod';

/**
 * "5551234567", "(555) 123-4567" or "+1 555 123 4567"  ->  "+1 (555) - 123 - 4567".
 * Returns null for blank text, and undefined when the text is not a 10-digit US number.
 */
export function formatPhone(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  const digits = raw.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return undefined;
  return `+1 (${national.slice(0, 3)}) - ${national.slice(3, 6)} - ${national.slice(6)}`;
}

export const PHONE_MESSAGE = 'Enter a 10-digit US phone number, like (555) 123-4567';

/** A phone field: blank becomes null, anything else must be a valid number and comes out formatted. */
export const phoneSchema = z
  .string()
  .trim()
  .max(40, PHONE_MESSAGE)
  .transform((value, ctx) => {
    const formatted = formatPhone(value);
    if (formatted === undefined) {
      ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE });
      return z.NEVER;
    }
    return formatted;
  });
