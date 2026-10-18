// Private file storage for seller-application documents (business licences, permits...).
// Files live under config.uploadDir and are NEVER served directly: only staff can fetch
// them, through an authenticated route. Names on disk are random; the type is decided by
// looking at the file's first bytes, not by trusting the filename or the claimed type.
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Returns { mime, ext } for PDF / JPEG / PNG / HEIC, or null for anything else. */
export function sniffFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return { mime: 'image/png', ext: 'png' };
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp' && HEIC_BRANDS.has(buffer.subarray(8, 12).toString('latin1'))) {
    return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}

/** A fresh random storage key such as "seller-applications/<application id>/<uuid>.pdf". */
export function newStorageKey(applicationId, ext) {
  return `seller-applications/${applicationId}/${randomUUID()}.${ext}`;
}

/** Turns a storage key into a full path, refusing anything that would escape the upload folder. */
export function pathForKey(key) {
  const root = resolve(config.uploadDir);
  const full = resolve(root, key);
  if (!full.startsWith(root + sep)) throw new Error(`Refusing storage key outside the upload folder: ${key}`);
  return full;
}

export async function saveFile(key, buffer) {
  const full = pathForKey(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buffer, { flag: 'wx', mode: 0o600 });
}

/** Best-effort delete; a missing file is not an error. */
export async function deleteFiles(keys) {
  for (const key of keys) {
    try {
      await rm(pathForKey(key), { force: true });
    } catch (err) {
      logger.error(`could not delete stored file ${key}`, err);
    }
  }
}
