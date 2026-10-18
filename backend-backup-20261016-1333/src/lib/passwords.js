import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';

// Spec: at least 8 characters, an uppercase and a lowercase letter, a number and a symbol.
// bcrypt only looks at the first 72 bytes, so longer passwords are rejected instead of silently truncated.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v) <= 72, 'Password must be at most 72 bytes')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a number')
  .regex(/[^A-Za-z0-9]/, 'Password needs a symbol');

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared against when the account doesn't exist, so "unknown user" and
// "wrong password" take the same time and can't be told apart by timing.
let dummyHash;
export async function burnPasswordTime(plain) {
  dummyHash ??= await bcrypt.hash('not-a-real-password', config.bcryptRounds);
  await bcrypt.compare(plain, dummyHash);
}
