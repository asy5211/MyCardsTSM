// One error shape for the whole API:
//   { "error": { "code": "validation_error", "message": "...", "details": [...] } }
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required', code = 'unauthorized') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'Not allowed', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message, details) => new HttpError(409, 'conflict', message, details);

export function notFoundHandler(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Some fields are invalid',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large' } });
  }
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl} [${req.id}]`, err);
  return res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our side', requestId: req.id } });
}
