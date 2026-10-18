import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { startServer } from './helpers.js';
import { auditCount, newUser } from './v4-helpers.js';

describe('contact support (guests and signed-in people)', () => {
  let t;
  let admin;
  let help;
  let user;
  let other;

  const guestBody = (over = {}) => ({ name: 'Pat Guest', email: 'Pat@Example.com', topic: 'account', subject: 'Cannot sign in', message: 'I forgot my password and the reset email never arrives.', ...over });

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'help@tsm.test', 'Help Desk', ?, 'support')",
      [await hashPassword('HelpPass1!')],
    );
    help = await t.staffLogin('help@tsm.test', 'HelpPass1!');
    user = await newUser(t, 'asker');
    other = await newUser(t, 'other');
  });
  after(() => t.stop());

  describe('writing to support', () => {
    it('lets a guest write, as long as they say who they are', async () => {
      const r = await t.api('/api/support', { method: 'POST', body: guestBody() });
      assert.equal(r.status, 201);
      assert.match(r.json.request.ref, /^SUP-\d{6}$/);
      assert.equal(r.json.request.isGuest, true);
      assert.equal(r.json.request.status, 'open');
      assert.equal(r.json.request.email, 'pat@example.com'); // tidied
      assert.equal(r.json.request.name, 'Pat Guest');

      const noName = await t.api('/api/support', { method: 'POST', body: guestBody({ name: undefined }) });
      assert.equal(noName.status, 400);
      assert.ok(noName.json.error.details.some((d) => d.field === 'name'));
      const noEmail = await t.api('/api/support', { method: 'POST', body: guestBody({ email: undefined }) });
      assert.equal(noEmail.status, 400);
      assert.ok(noEmail.json.error.details.some((d) => d.field === 'email'));
      assert.equal((await t.api('/api/support', { method: 'POST', body: guestBody({ email: 'not-an-email' }) })).status, 400);
    });

    it('checks the subject, message and topic', async () => {
      const post = (over) => t.api('/api/support', { method: 'POST', body: guestBody(over) });
      assert.equal((await post({ subject: 'Hi' })).status, 400);
      assert.equal((await post({ message: 'Too short' })).status, 400);
      assert.equal((await post({ message: 'x'.repeat(2001) })).status, 400);
      assert.equal((await post({ topic: 'gossip' })).status, 400);
      assert.equal((await post({ topic: undefined })).json.request.topic, 'other'); // defaults
    });

    it('uses the account details for a signed-in person', async () => {
      const r = await t.api('/api/support', { method: 'POST', token: user.token, body: { topic: 'order', subject: 'Where is my order?', message: 'It has been ten days and there is no tracking.' } });
      assert.equal(r.status, 201);
      assert.equal(r.json.request.isGuest, false);
      assert.equal(r.json.request.name, user.username);
      assert.equal(r.json.request.email, user.email);
      assert.equal(await auditCount('support.requested', r.json.request.id), 1);
    });
  });

  describe('a signed-in person’s conversation', () => {
    let id;
    before(async () => {
      const r = await t.api('/api/support', { method: 'POST', token: user.token, body: { subject: 'Change my username', message: 'Please change my username to something shorter.' } });
      id = r.json.request.id;
    });

    it('lists only my requests and shows the thread', async () => {
      assert.equal((await t.api('/api/support')).status, 401); // guests have no list to come back to
      const mine = await t.api('/api/support', { token: user.token });
      assert.ok(mine.json.items.some((x) => x.id === id));
      assert.equal((await t.api('/api/support', { token: other.token })).json.items.length, 0);
      const one = await t.api(`/api/support/${id}`, { token: user.token });
      assert.equal(one.json.messages.length, 1);
      assert.equal(one.json.messages[0].mine, true);
      assert.equal(one.json.messages[0].body, 'Please change my username to something shorter.');
      assert.equal((await t.api(`/api/support/${id}`, { token: other.token })).status, 404);
      assert.equal((await t.api('/api/support/nope', { token: user.token })).status, 404);
    });

    it('lets staff answer (any staff role), which marks it Answered', async () => {
      assert.equal((await t.api(`/api/staff/support/${id}/messages`, { method: 'POST', body: { body: 'Hello' } })).status, 401);
      const r = await t.api(`/api/staff/support/${id}/messages`, { method: 'POST', token: help, body: { body: 'Done! Your username is changed.' } });
      assert.equal(r.status, 201);
      assert.equal(r.json.senderType, 'staff');
      assert.equal(r.json.mine, true);
      const detail = await t.api(`/api/staff/support/${id}`, { token: help });
      assert.equal(detail.json.request.status, 'answered');
      assert.equal(detail.json.messages.length, 2);
      const theirs = await t.api(`/api/support/${id}`, { token: user.token });
      assert.equal(theirs.json.request.status, 'answered');
      assert.equal(theirs.json.messages[1].mine, false);
      assert.equal(theirs.json.messages[1].senderName, 'Help Desk');
      assert.equal((await t.api(`/api/staff/support/${id}/messages`, { method: 'POST', token: help, body: { body: '' } })).status, 400);
    });

    it('opens it again when the person writes back, and stops writes once it is closed', async () => {
      const back = await t.api(`/api/support/${id}/messages`, { method: 'POST', token: user.token, body: { body: 'Thanks, one more thing...' } });
      assert.equal(back.status, 201);
      assert.equal(back.json.mine, true);
      assert.equal((await t.api(`/api/support/${id}`, { token: user.token })).json.request.status, 'open');
      assert.equal((await t.api(`/api/support/${id}/messages`, { method: 'POST', token: other.token, body: { body: 'hello' } })).status, 404);
      assert.equal((await t.api(`/api/support/${id}/messages`, { method: 'POST', token: user.token, body: { body: '   ' } })).status, 400);

      const closed = await t.api(`/api/staff/support/${id}/status`, { method: 'POST', token: help, body: { status: 'closed' } });
      assert.equal(closed.json.request.status, 'closed');
      assert.equal((await t.api(`/api/support/${id}/messages`, { method: 'POST', token: user.token, body: { body: 'Hello again' } })).status, 409);
      const reopened = await t.api(`/api/staff/support/${id}/status`, { method: 'POST', token: help, body: { status: 'open' } });
      assert.equal(reopened.json.request.status, 'open');
      assert.equal((await t.api(`/api/staff/support/${id}/status`, { method: 'POST', token: help, body: { status: 'pending' } })).status, 400);
      assert.equal(await auditCount('support.closed', id), 1);
      assert.equal(await auditCount('support.reopened', id), 1);
    });
  });

  describe('the staff inbox', () => {
    it('lists guests and signed-in requests together, newest open first, with counts', async () => {
      const guest = await t.api('/api/support', { method: 'POST', body: guestBody({ subject: 'Guest question', email: 'guest.inbox@example.com' }) });
      const list = await t.api('/api/staff/support', { token: help });
      assert.equal(list.status, 200);
      assert.ok(list.json.items.some((r) => r.isGuest));
      assert.ok(list.json.items.some((r) => !r.isGuest));
      assert.ok(list.json.counts.open >= 1);
      assert.equal(list.json.counts.open + list.json.counts.answered + list.json.counts.closed, list.json.total);
      // a guest can be answered too (by email, outside the app)
      const reply = await t.api(`/api/staff/support/${guest.json.request.id}/messages`, { method: 'POST', token: help, body: { body: 'We have sent you a reset link.' } });
      assert.equal(reply.status, 201);
      assert.equal((await t.api(`/api/staff/support/${guest.json.request.id}`, { token: help })).json.request.status, 'answered');
    });

    it('searches by reference, email or subject and filters by status', async () => {
      const guest = await t.api('/api/support', { method: 'POST', body: guestBody({ subject: 'Zebra stripes', email: 'zebra@example.com' }) });
      const byRef = await t.api(`/api/staff/support?q=${guest.json.request.ref}`, { token: admin });
      assert.equal(byRef.json.total, 1);
      assert.equal((await t.api('/api/staff/support?q=zebra%40example.com', { token: admin })).json.total, 1);
      assert.equal((await t.api('/api/staff/support?q=Zebra', { token: admin })).json.total, 1);
      assert.equal((await t.api('/api/staff/support?status=closed', { token: admin })).json.items.every((r) => r.status === 'closed'), true);
      assert.equal((await t.api('/api/staff/support?status=bogus', { token: admin })).status, 400);
      assert.equal((await t.api('/api/staff/support/nope', { token: admin })).status, 404);
    });

    it('blanks the name and email when the person deletes their account', async () => {
      const leaver = await newUser(t, 'leaver');
      const made = await t.api('/api/support', { method: 'POST', token: leaver.token, body: { subject: 'About to leave', message: 'I am about to delete my account.' } });
      const gone = await t.api('/api/me', { method: 'DELETE', token: leaver.token, body: { password: 'Sup3r$ecret' } });
      assert.equal(gone.status, 204);
      const row = await t.api(`/api/staff/support/${made.json.request.id}`, { token: help });
      assert.equal(row.json.request.name, 'Deleted user');
      assert.equal(row.json.request.email, 'removed@deleted.invalid');
      assert.equal(row.json.messages[0].body, 'I am about to delete my account.'); // the text stays for TSM's records
    });
  });
});
