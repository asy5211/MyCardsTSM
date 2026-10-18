// Small pieces of logic that need no database: phone formatting, CSV cells, encryption, box labels, sales buckets, tickets.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { csvCell } from '../src/routes/staffInsights.js';
import { decryptJson, encryptJson } from '../src/lib/crypto.js';
import { boxLabel, trackingUrl } from '../src/lib/orders.js';
import { PHONE_MESSAGE, formatPhone, phoneSchema } from '../src/lib/phone.js';
import { newOrderNumber, newSupportRef, newTicketNumber } from '../src/lib/refs.js';
import { percentLabel } from '../src/lib/settings.js';
import { assertCan, money } from '../src/lib/tickets.js';
import { bucketEnd, bucketStarts, describePayoutMethod, routingNumberOk } from '../src/routes/sellerSales.js';

describe('phone numbers', () => {
  it('always come out as +1 (555) - 123 - 4567', () => {
    for (const input of ['5551234567', '(555) 123-4567', '555.123.4567', '+1 555 123 4567', '1-555-123-4567', ' 555 123 4567 ']) {
      assert.equal(formatPhone(input), '+1 (555) - 123 - 4567', input);
    }
  });
  it('treats blank as "no phone" and refuses anything that is not a 10-digit number', () => {
    assert.equal(formatPhone(''), null);
    assert.equal(formatPhone('   '), null);
    assert.equal(formatPhone(null), null);
    for (const bad of ['555-0199', '12345', 'call me', '+44 20 7946 0958', '55512345678']) {
      assert.equal(formatPhone(bad), undefined, bad);
    }
  });
  it('works as a form field', () => {
    assert.equal(phoneSchema.parse('(555) 123-4567'), '+1 (555) - 123 - 4567');
    assert.equal(phoneSchema.parse(''), null);
    const bad = z.object({ phone: phoneSchema }).safeParse({ phone: '555' });
    assert.equal(bad.success, false);
    assert.equal(bad.error.issues[0].message, PHONE_MESSAGE);
  });
});

describe('CSV cells', () => {
  it('quote what needs quoting and defuse spreadsheet formulas', () => {
    assert.equal(csvCell('plain'), 'plain');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(42), '42');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
    assert.equal(csvCell('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"');
    assert.equal(csvCell('+1 555'), "'+1 555");
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  });
});

describe('encrypting payout details', () => {
  it('round-trips, and only for the seller it was made for', () => {
    const secret = { routingNumber: '021000021', accountNumber: '123456789' };
    const blob = encryptJson(secret, 'seller-1');
    assert.ok(Buffer.isBuffer(blob));
    assert.ok(!blob.toString('utf8').includes('123456789'), 'the account number must not appear in the stored bytes');
    assert.deepEqual(decryptJson(blob, 'seller-1'), secret);
    assert.throws(() => decryptJson(blob, 'seller-2'));
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptJson(tampered, 'seller-1'));
  });
  it('uses a new nonce each time', () => {
    assert.notDeepEqual(encryptJson({ a: 1 }, 'x'), encryptJson({ a: 1 }, 'x'));
  });
});

describe('box labels and tracking links', () => {
  it('says which boxes a buyer received', () => {
    assert.equal(boxLabel(4, 4, 12), 'Box 4 of 12');
    assert.equal(boxLabel(4, 6, 12), 'Boxes 4–6 of 12');
    assert.equal(boxLabel(null, null, null), null);
  });
  it('builds tracking links for the known carriers only', () => {
    assert.equal(trackingUrl('UPS', '1Z999'), 'https://www.ups.com/track?tracknum=1Z999');
    assert.match(trackingUrl('USPS', '9400 1'), /TrackConfirmAction\?tLabels=9400%201$/);
    assert.equal(trackingUrl('Other', '123'), null);
    assert.equal(trackingUrl('UPS', null), null);
  });
  it('makes readable reference numbers', () => {
    assert.match(newOrderNumber(), /^TSM-[A-HJ-NP-Z2-9]{8}$/);
    assert.match(newTicketNumber(), /^SUB-\d{6}$/);
    assert.match(newSupportRef(), /^SUP-\d{6}$/);
  });
});

describe('sales buckets', () => {
  const now = new Date('2026-10-16T15:30:00Z'); // a Friday
  it('lists the last days, oldest first', () => {
    const days = bucketStarts('day', 3, now).map((d) => d.toISOString().slice(0, 10));
    assert.deepEqual(days, ['2026-10-14', '2026-10-15', '2026-10-16']);
    assert.equal(bucketEnd('day', new Date('2026-10-16T00:00:00Z')).toISOString(), '2026-10-17T00:00:00.000Z');
  });
  it('starts weeks on Monday', () => {
    const weeks = bucketStarts('week', 2, now).map((d) => d.toISOString().slice(0, 10));
    assert.deepEqual(weeks, ['2026-10-05', '2026-10-12']);
    assert.equal(bucketEnd('week', new Date('2026-10-12T00:00:00Z')).toISOString().slice(0, 10), '2026-10-19');
  });
  it('steps whole months, across a new year', () => {
    const months = bucketStarts('month', 4, new Date('2026-02-10T00:00:00Z')).map((d) => d.toISOString().slice(0, 10));
    assert.deepEqual(months, ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    assert.equal(bucketEnd('month', new Date('2025-12-01T00:00:00Z')).toISOString().slice(0, 10), '2026-01-01');
  });
});

describe('payout methods', () => {
  it('checks the routing number check digit', () => {
    assert.equal(routingNumberOk('021000021'), true);
    assert.equal(routingNumberOk('021000022'), false);
    assert.equal(routingNumberOk('12345'), false);
  });
  it('shows only a masked label and keeps the real details separate', () => {
    const bank = describePayoutMethod({ type: 'bank_transfer', accountHolder: 'A', routingNumber: '021000021', accountNumber: '000123456789' });
    assert.equal(bank.label, 'Bank account ending 6789');
    assert.ok(!bank.label.includes('0001234'));
    assert.deepEqual(bank.details, { routingNumber: '021000021', accountNumber: '000123456789' });
    assert.equal(describePayoutMethod({ type: 'paypal', accountHolder: 'A', email: 'jane.doe@example.com' }).label, 'PayPal j*****@example.com');
    assert.equal(describePayoutMethod({ type: 'zelle', accountHolder: 'A', contact: '5551234567' }).label, 'Zelle phone ending 4567');
    assert.equal(describePayoutMethod({ type: 'zelle', accountHolder: 'A', contact: 'sam@example.com' }).label, 'Zelle s**@example.com');
    assert.throws(() => describePayoutMethod({ type: 'zelle', accountHolder: 'A', contact: 'nope' }), (e) => e.status === 400);
    const check = describePayoutMethod({ type: 'check', accountHolder: 'A', line1: '1 Main', line2: null, city: 'Austin', region: 'TX', postalCode: '78701' });
    assert.equal(check.label, 'Paper check to Austin, TX');
  });
});

describe('sell-to-us ticket rules', () => {
  it('only allows the next sensible step', () => {
    assert.equal(assertCan({ status: 'offer_sent' }, 'userAccept'), 'accepted');
    assert.equal(assertCan({ status: 'offer_sent' }, 'userCounter'), 'countered');
    assert.equal(assertCan({ status: 'countered' }, 'staffOffer'), 'offer_sent');
    assert.equal(assertCan({ status: 'countered' }, 'staffAcceptCounter'), 'accepted');
    assert.equal(assertCan({ status: 'accepted' }, 'staffComplete'), 'completed');
    for (const [status, action] of [['submitted', 'userAccept'], ['accepted', 'userCounter'], ['declined', 'staffOffer'], ['completed', 'userDecline'], ['offer_sent', 'staffComplete']]) {
      assert.throws(() => assertCan({ status }, action), (e) => e.status === 409 && e.code === 'wrong_status', `${status} + ${action}`);
    }
  });
  it('writes money the way people read it', () => {
    assert.equal(money(123450), '$1,234.50');
    assert.equal(money(5), '$0.05');
    assert.equal(money(100000000), '$1,000,000.00');
  });
  it('writes percentages without trailing zeros', () => {
    assert.equal(percentLabel(500), '5%');
    assert.equal(percentLabel(275), '2.75%');
    assert.equal(percentLabel(0), '0%');
  });
});
