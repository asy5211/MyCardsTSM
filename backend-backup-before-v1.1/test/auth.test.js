import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { outbox } from '../src/lib/mailer.js';
import { ADMIN, DEMO_PASSWORD, startServer } from './helpers.js';

const newUser = (over = {}) => ({
  username: 'new_collector',
  email: 'New.Collector@Example.com',
  password: 'Sup3r$ecret',
  confirmPassword: 'Sup3r$ecret',
  acceptedTerms: true,
  ...over,
});

describe('accounts', () => {
  let t;
  before(async () => {
    t = await startServer();
  });
  after(() => t.stop());

  describe('register', () => {
    it('creates an account, lowercases the email, and returns a token without secrets', async () => {
      const r = await t.api('/api/auth/register', { method: 'POST', body: newUser() });
      assert.equal(r.status, 201);
      assert.ok(r.json.token);
      assert.equal(r.json.user.email, 'new.collector@example.com');
      assert.equal(r.json.user.username, 'new_collector');
      assert.equal(JSON.stringify(r.json).includes('password'), false);
      const me = await t.api('/api/me', { token: r.json.token });
      assert.equal(me.status, 200);
      assert.equal(me.json.isApprovedSeller, false);
      assert.equal(me.json.sellerApplication, null);
    });

    it('rejects a duplicate email (any capitalisation) and a duplicate username', async () => {
      const email = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'someone_else', email: 'new.collector@EXAMPLE.com' }),
      });
      assert.equal(email.status, 409);
      assert.equal(email.json.error.details[0].field, 'email');
      const username = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'NEW_COLLECTOR', email: 'other@example.com' }),
      });
      assert.equal(username.status, 409);
      assert.equal(username.json.error.details[0].field, 'username');
    });

    it('enforces the password rules, matching confirmation and the terms checkbox', async () => {
      const weak = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'weakling', email: 'weak@example.com', password: 'password', confirmPassword: 'password' }),
      });
      assert.equal(weak.status, 400);
      const messages = weak.json.error.details.map((d) => d.message).join(' | ');
      assert.match(messages, /uppercase/);
      assert.match(messages, /number/);
      assert.match(messages, /symbol/);

      const mismatch = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'mismatch', email: 'mm@example.com', confirmPassword: 'Different1!' }),
      });
      assert.equal(mismatch.status, 400);
      assert.equal(mismatch.json.error.details[0].field, 'confirmPassword');

      const noTerms = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'noterms', email: 'nt@example.com', acceptedTerms: false }),
      });
      assert.equal(noTerms.status, 400);
      assert.equal(noTerms.json.error.details[0].field, 'acceptedTerms');

      const short = await t.api('/api/auth/register', {
        method: 'POST',
        body: newUser({ username: 'ab', email: 'ab@example.com' }),
      });
      assert.equal(short.status, 400);
    });
  });

  describe('login', () => {
    it('signs in with email or username', async () => {
      const byEmail = await t.api('/api/auth/login', { method: 'POST', body: { login: 'buyer@tsm.test', password: DEMO_PASSWORD } });
      assert.equal(byEmail.status, 200);
      assert.equal(byEmail.json.user.username, 'buyer_demo');
      const byName = await t.api('/api/auth/login', { method: 'POST', body: { login: 'BUYER_DEMO', password: DEMO_PASSWORD } });
      assert.equal(byName.status, 200);
    });

    it('gives the same 401 for a wrong password and an unknown account', async () => {
      const wrong = await t.api('/api/auth/login', { method: 'POST', body: { login: 'buyer@tsm.test', password: 'Nope1234!' } });
      const unknown = await t.api('/api/auth/login', { method: 'POST', body: { login: 'ghost@tsm.test', password: 'Nope1234!' } });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrong.json, unknown.json);
      assert.equal(wrong.json.error.code, 'invalid_credentials');
    });

    it('blocks a suspended account', async () => {
      await pool.query("UPDATE users SET status = 'suspended' WHERE email = 'alpha@tsm.test'");
      const r = await t.api('/api/auth/login', { method: 'POST', body: { login: 'alpha@tsm.test', password: DEMO_PASSWORD } });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'account_suspended');
    });

    it('rejects a malformed body', async () => {
      const r = await t.api('/api/auth/login', { method: 'POST', body: {} });
      assert.equal(r.status, 400);
    });
  });

  describe('/api/me', () => {
    it('requires a valid token', async () => {
      assert.equal((await t.api('/api/me')).status, 401);
      assert.equal((await t.api('/api/me', { token: 'garbage' })).status, 401);
    });

    it('shows seller status: approved seller, pending applicant, plain buyer', async () => {
      const seller = await t.api('/api/me', { token: await t.login('seller@tsm.test') });
      assert.equal(seller.json.isApprovedSeller, true);
      assert.equal(seller.json.sellerProfile.displayName, 'Demo Seller');
      assert.equal(seller.json.sellerApplication.status, 'approved');

      const applicant = await t.api('/api/me', { token: await t.login('applicant@tsm.test') });
      assert.equal(applicant.json.isApprovedSeller, false);
      assert.equal(applicant.json.sellerApplication.status, 'submitted');

      const buyer = await t.api('/api/me', { token: await t.login('buyer@tsm.test') });
      assert.equal(buyer.json.isApprovedSeller, false);
      assert.equal(buyer.json.sellerApplication, null);
    });

    it('edits username and phone, and refuses a taken username', async () => {
      const token = await t.login('buyer@tsm.test');
      const ok = await t.api('/api/me', { method: 'PATCH', token, body: { username: 'buyer_renamed', phone: '555-0199' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.username, 'buyer_renamed');
      assert.equal(ok.json.phone, '555-0199');
      const taken = await t.api('/api/me', { method: 'PATCH', token, body: { username: 'seller_demo' } });
      assert.equal(taken.status, 409);
      const empty = await t.api('/api/me', { method: 'PATCH', token, body: {} });
      assert.equal(empty.status, 400);
    });

    it('changes the password: needs the current one, then the old one stops working', async () => {
      const token = await t.login('toptier@tsm.test');
      const wrong = await t.api('/api/me/change-password', {
        method: 'POST',
        token,
        body: { currentPassword: 'Wrong123!', newPassword: 'Brand$New9', confirmPassword: 'Brand$New9' },
      });
      assert.equal(wrong.status, 401);
      const same = await t.api('/api/me/change-password', {
        method: 'POST',
        token,
        body: { currentPassword: DEMO_PASSWORD, newPassword: DEMO_PASSWORD, confirmPassword: DEMO_PASSWORD },
      });
      assert.equal(same.status, 400);
      const ok = await t.api('/api/me/change-password', {
        method: 'POST',
        token,
        body: { currentPassword: DEMO_PASSWORD, newPassword: 'Brand$New9', confirmPassword: 'Brand$New9' },
      });
      assert.equal(ok.status, 200);
      const oldLogin = await t.api('/api/auth/login', { method: 'POST', body: { login: 'toptier@tsm.test', password: DEMO_PASSWORD } });
      assert.equal(oldLogin.status, 401);
      await t.login('toptier@tsm.test', 'Brand$New9');
    });
  });

  describe('forgot / reset password', () => {
    const tokenFromOutbox = (to) => {
      const mail = [...outbox].reverse().find((m) => m.to === to);
      return mail ? new URL(mail.link).searchParams.get('token') : null;
    };

    it('answers the same for unknown emails and sends nothing', async () => {
      const before = outbox.length;
      const r = await t.api('/api/auth/forgot-password', { method: 'POST', body: { email: 'nobody@example.com' } });
      assert.equal(r.status, 200);
      assert.equal(outbox.length, before);
    });

    it('emails a tsm:// link; the token works once, then never again', async () => {
      const r = await t.api('/api/auth/forgot-password', { method: 'POST', body: { email: 'prime@tsm.test' } });
      assert.equal(r.status, 200);
      const mail = outbox.at(-1);
      assert.equal(mail.to, 'prime@tsm.test');
      assert.ok(mail.link.startsWith('tsm://reset-password?token='));
      const token = tokenFromOutbox('prime@tsm.test');

      const weak = await t.api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'weak', confirmPassword: 'weak' },
      });
      assert.equal(weak.status, 400);

      const ok = await t.api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'Reset$Pass1', confirmPassword: 'Reset$Pass1' },
      });
      assert.equal(ok.status, 200);
      await t.login('prime@tsm.test', 'Reset$Pass1');

      const again = await t.api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'Another$Pass2', confirmPassword: 'Another$Pass2' },
      });
      assert.equal(again.status, 400);
      assert.equal(again.json.error.code, 'invalid_reset_token');
    });

    it('rejects an expired token and a made-up token', async () => {
      await t.api('/api/auth/forgot-password', { method: 'POST', body: { email: 'hub@tsm.test' } });
      const token = tokenFromOutbox('hub@tsm.test');
      await pool.query(
        "UPDATE password_reset_tokens SET expires_at = '2020-01-01 00:00:00' WHERE user_id = (SELECT id FROM users WHERE email = 'hub@tsm.test')",
      );
      const expired = await t.api('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'Reset$Pass1', confirmPassword: 'Reset$Pass1' },
      });
      assert.equal(expired.status, 400);
      const fake = await t.api('/api/auth/reset-password', {
        method: 'POST',
        body: { token: 'f'.repeat(64), newPassword: 'Reset$Pass1', confirmPassword: 'Reset$Pass1' },
      });
      assert.equal(fake.status, 400);
    });

    it('stores only a hash of the token', async () => {
      await t.api('/api/auth/forgot-password', { method: 'POST', body: { email: 'elite@tsm.test' } });
      const token = tokenFromOutbox('elite@tsm.test');
      const [rows] = await pool.query('SELECT token_hash FROM password_reset_tokens');
      assert.equal(rows.some((r) => r.token_hash === token), false);
      assert.equal(rows.every((r) => r.token_hash.length === 64), true);
    });
  });

  describe('data export', () => {
    it('returns the user\'s own data as a download, without password hashes', async () => {
      const token = await t.login('seller@tsm.test');
      const r = await t.api('/api/me/export', { token });
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-disposition'), /attachment/);
      assert.equal(r.json.account.email, 'seller@tsm.test');
      assert.equal(r.json.listings.length, 7);
      assert.equal(r.json.sellerApplications.length, 1);
      assert.equal(JSON.stringify(r.json).includes('password_hash'), false);
      assert.equal(JSON.stringify(r.json).includes('$2'), false);
    });
  });

  describe('account deletion', () => {
    it('needs the password, then anonymises the account and pulls a seller\'s offers', async () => {
      const token = await t.login('seller@tsm.test');
      const noBody = await t.api('/api/me', { method: 'DELETE', token, body: {} });
      assert.equal(noBody.status, 400);
      const wrong = await t.api('/api/me', { method: 'DELETE', token, body: { password: 'Wrong123!' } });
      assert.equal(wrong.status, 401);

      const ok = await t.api('/api/me', { method: 'DELETE', token, body: { password: DEMO_PASSWORD } });
      assert.equal(ok.status, 204);

      // The old token and the old credentials stop working immediately.
      assert.equal((await t.api('/api/me', { token })).status, 401);
      const login = await t.api('/api/auth/login', { method: 'POST', body: { login: 'seller@tsm.test', password: DEMO_PASSWORD } });
      assert.equal(login.status, 401);

      const [[row]] = await pool.query("SELECT username, email, phone, status FROM users WHERE username LIKE 'deleted\\_%' AND status = 'deleted'");
      assert.match(row.email, /@deleted\.invalid$/);
      const [[app]] = await pool.query("SELECT contact_email, business_address FROM seller_applications WHERE contact_email = 'removed@deleted.invalid'");
      assert.equal(app.business_address, '[removed]');

      // Their offer on Collector Set Alpha is gone from the shop.
      const list = await t.api('/api/products?q=collector%20set');
      const detail = await t.api(`/api/products/${list.json.items[0].id}`);
      assert.equal(detail.json.sellerCount, 3);
      assert.equal(detail.json.listings.some((l) => l.seller.displayName === 'Demo Seller'), false);
    });
  });

  describe('admin staff login', () => {
    it('signs a staff member in and keeps the two token types apart', async () => {
      const bad = await t.api('/api/staff/login', { method: 'POST', body: { email: ADMIN.email, password: 'Wrong123!' } });
      assert.equal(bad.status, 401);

      const ok = await t.api('/api/staff/login', { method: 'POST', body: ADMIN });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.staff.role, 'super_admin');
      const staffToken = ok.json.token;

      assert.equal((await t.api('/api/staff/me', { token: staffToken })).status, 200);
      // A customer token is not a staff token, and a staff token is not a customer token.
      const userToken = await t.login('buyer@tsm.test');
      assert.equal((await t.api('/api/staff/me', { token: userToken })).status, 401);
      assert.equal((await t.api('/api/me', { token: staffToken })).status, 401);
      assert.equal((await t.api('/api/staff/me')).status, 401);
    });

    it('records sign-ins in the audit log', async () => {
      const [rows] = await pool.query("SELECT action FROM audit_logs WHERE action IN ('staff.login','staff.login_failed') ORDER BY id");
      assert.deepEqual(rows.map((r) => r.action), ['staff.login_failed', 'staff.login']);
    });
  });
});
