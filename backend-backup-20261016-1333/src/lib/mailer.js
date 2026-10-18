// Email stub. Real sending (a provider such as Postmark or SES) arrives with the notifications slice.
// In development the message is printed to this terminal so you can click/copy the link.
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Tests read this to find the reset token that "was emailed". */
export const outbox = [];

export async function sendPasswordReset({ to, link }) {
  if (config.isTest) {
    outbox.push({ type: 'password_reset', to, link });
    return;
  }
  if (config.isProduction) {
    logger.warn('No email provider configured yet - password reset email NOT sent');
    return;
  }
  logger.info(`[dev mail] Password reset for ${to}\n    ${link}`);
}
