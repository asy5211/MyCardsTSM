import { HttpError } from '../errors.js';

/** Validate `data` against a zod schema; throws a 400 with per-field messages. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new HttpError(
      400,
      'validation_error',
      'Some fields are invalid',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
