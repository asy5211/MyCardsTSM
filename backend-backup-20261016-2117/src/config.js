// Reads and validates environment settings once, at startup.
// If something is wrong the server refuses to start and says what to fix,
// instead of failing mysteriously later.

import 'dotenv/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  // Tests never use your real secrets, and hash passwords cheaply so they run fast.
  process.env.JWT_SECRET_USER = 'test-user-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
  process.env.JWT_SECRET_STAFF = 'test-staff-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.ALLOW_TEST_SELLER_AUTOAPPROVE = 'true'; // tests flip config.allowTestSellerAutoApprove directly when they need it off
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
}

const secret = z
  .string({ error: 'is missing - run "npm run init-env"' })
  .min(32, 'must be at least 32 characters - run "npm run init-env"')
  .refine((v) => !v.includes('replace-me'), 'is still the placeholder - run "npm run init-env"');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string({ error: 'is missing' }).url('must be a mysql:// URL'),
  JWT_SECRET_USER: secret,
  JWT_SECRET_STAFF: secret,
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  PASSWORD_RESET_LINK_BASE: z.string().default('tsm://reset-password'),
  ALLOW_TEST_SELLER_AUTOAPPROVE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Where uploaded seller-application documents are kept (private; never served directly).
  UPLOAD_DIR: z.string().optional(),
  // The starting value for TSM's cut of each sale, in basis points (500 = 5.00%). Admins change the live rate
  // on the website (Settings); this is only used until that setting exists.
  COMMISSION_BPS: z.coerce.number().int().min(0).max(5000).default(500),
  // Key for encrypting seller payout details: 64 hex characters (npm run init-env creates one).
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters - run "npm run init-env"')
    .optional(),
  // Where the seller dashboard website lives, shown to approved sellers in the app. Optional:
  // when it is empty the app link is built from the address the app used to reach this server, with port 5173.
  SELLER_PORTAL_URL: z.string().url('must be a full web address, like https://sell.example.com').optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\nTSM backend cannot start. Fix these settings in backend/.env:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || 'config'}: ${issue.message}`);
  }
  console.error('\nTip: "npm run init-env" creates .env with fresh secrets.\n');
  process.exit(1);
}

const env = parsed.data;

if (isTest) {
  // Safety: the test loader drops and recreates every table. Never let it touch a real database.
  const dbName = decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1));
  if (!dbName.endsWith('_test')) {
    console.error(`\nRefusing to run tests: TEST_DATABASE_URL points at "${dbName}", which does not end in "_test".\n`);
    process.exit(1);
  }
}

if (env.NODE_ENV === 'production' && env.ALLOW_TEST_SELLER_AUTOAPPROVE) {
  console.error('\nALLOW_TEST_SELLER_AUTOAPPROVE must be false in production.\n');
  process.exit(1);
}

// Default: backend/storage (git-ignored). Tests write to a throwaway folder instead.
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uploadDir = isTest
  ? mkdtempSync(join(tmpdir(), 'tsm-test-uploads-'))
  : resolve(env.UPLOAD_DIR ?? join(backendRoot, 'storage'));

export const config = {
  env: env.NODE_ENV,
  isTest,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwt: {
    userSecret: env.JWT_SECRET_USER,
    staffSecret: env.JWT_SECRET_STAFF,
    userTtl: '7d',
    staffTtl: '8h',
  },
  bcryptRounds: env.BCRYPT_ROUNDS,
  resetLinkBase: env.PASSWORD_RESET_LINK_BASE,
  resetTokenTtlMinutes: 60,
  termsVersion: '1.0',
  allowTestSellerAutoApprove: env.ALLOW_TEST_SELLER_AUTOAPPROVE,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir,
  maxUploadBytes: 10 * 1024 * 1024, // per document
  maxApplicationDocuments: 5,
  maxProductImageBytes: 5 * 1024 * 1024, // per product photo
  commissionBps: env.COMMISSION_BPS,
  dataEncryptionKey: env.DATA_ENCRYPTION_KEY,
  sellerPortalUrl: env.SELLER_PORTAL_URL ? env.SELLER_PORTAL_URL.replace(/\/+$/, '') : null,
};
