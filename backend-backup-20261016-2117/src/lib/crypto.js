// Encrypts small secrets (a seller's payout account details) before they go in the database.
// AES-256-GCM with a fresh random nonce for every value; the stored bytes are  nonce(12) + tag(16) + ciphertext.
// The seller's id is bound in as "associated data", so one seller's encrypted details cannot be pasted into another's row.
//
// The key is DATA_ENCRYPTION_KEY (64 hex characters) when it is set. If it is not, a key is derived from JWT_SECRET_USER,
// which works but means changing that secret makes old payout details unreadable. "npm run init-env" sets a separate key.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

function dataKey() {
  if (config.dataEncryptionKey) return Buffer.from(config.dataEncryptionKey, 'hex');
  return Buffer.from(hkdfSync('sha256', config.jwt.userSecret, 'tsm-data-key-salt', 'tsm payout details v1', 32));
}

export function encryptJson(value, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decryptJson(buffer, aad) {
  const bytes = Buffer.from(buffer);
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const text = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}
