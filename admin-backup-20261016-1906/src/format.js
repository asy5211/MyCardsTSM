// Small helpers for showing money, dates and labels the same way everywhere.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** 12499 -> "$124.99" (the API sends money as whole cents). */
export function money(cents) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return '—';
  return usd.format(Number(cents) / 100);
}

/** "124.99" or "$1,124.99" -> 12499 (whole cents), or null when it isn't a price. */
export function dollarsToCents(text) {
  const clean = String(text ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** 12499 -> "124.99" for putting back into a price box. */
export function centsToDollars(cents) {
  return (Number(cents) / 100).toFixed(2);
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function date(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function number(n) {
  return Number(n ?? 0).toLocaleString('en-US');
}

/** "3.00%" for basis points. */
export function percentFromBps(bps) {
  return `${(Number(bps) / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const SOURCE_OPTIONS = [
  { value: 'distributor', label: 'Authorized distributor' },
  { value: 'retail_store', label: 'Retail store' },
  { value: 'manufacturer_direct', label: 'Direct from manufacturer' },
  { value: 'other', label: 'Other source' },
];

export function sourceLabel(value) {
  return SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';
}

/** "Box 4 of 12" or "Loose product". */
export function packagingText(l) {
  if (l.packaging === 'case') return l.boxPosition || 'From a case';
  return 'Loose product';
}

/** Words for each offer status, with the colour the badge uses. */
export const LISTING_STATUS = {
  live: { label: 'Live', tone: 'green' },
  paused: { label: 'Paused', tone: 'gray' },
  on_hold: { label: 'On hold', tone: 'red' },
  sold_out: { label: 'Sold out', tone: 'amber' },
  seller_suspended: { label: 'Seller suspended', tone: 'red' },
};

export const APPLICATION_STATUS = {
  submitted: { label: 'Submitted', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
};

export const PAYOUT_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const EARNING_STATUS = {
  available: { label: 'Available', tone: 'amber' },
  in_payout: { label: 'In a payout', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  reversed: { label: 'Reversed', tone: 'gray' },
};

export const ACCOUNT_STATUS = {
  active: { label: 'Active', tone: 'green' },
  suspended: { label: 'Suspended', tone: 'red' },
  deleted: { label: 'Deleted', tone: 'gray' },
};

export const DOC_TYPE_LABEL = {
  city_permit: 'City permit',
  business_license: 'Business license',
  tax_permit: 'Tax permit',
  other: 'Other document',
};

/** Turns an audit action like "listing.held" into "Listing held". */
export function actionText(action) {
  const text = String(action || '').replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
