// The database stores DECIMAL(10,2) dollars; the API speaks integer cents so
// the app never does floating-point money math.

/** "124.99" -> 12499 (exact, no floating point). Accepts numbers too. */
export function toCents(decimal) {
  if (decimal === null || decimal === undefined) return null;
  const s = String(decimal);
  const negative = s.startsWith('-');
  const [whole, frac = ''] = (negative ? s.slice(1) : s).split('.');
  const cents = parseInt(whole || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return negative ? -cents : cents;
}

/** 12499 -> "124.99" (for writing back to DECIMAL columns). */
export function fromCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
