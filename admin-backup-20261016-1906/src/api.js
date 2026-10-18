// Talks to the TSM backend. Two kinds of sign-in exist and never mix:
//   "staff"  -> TSM employees (admin console)      token from POST /api/staff/login
//   "seller" -> approved sellers (seller portal)   token from POST /api/auth/login
// Tokens live in sessionStorage, so closing the tab signs you out.

// Leave empty in development (the Vite proxy forwards /api and /media to the backend).
// For a deployed site, set VITE_API_BASE=https://your-api.example.com when building.
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const KEYS = { staff: 'tsm.admin.staff', seller: 'tsm.admin.seller' };

export function readSession(kind) {
  try {
    const raw = sessionStorage.getItem(KEYS[kind]);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(kind, value) {
  try {
    if (value) sessionStorage.setItem(KEYS[kind], JSON.stringify(value));
    else sessionStorage.removeItem(KEYS[kind]);
  } catch {
    /* private mode: the session simply won't survive a reload */
  }
}

let onUnauthorized = () => {};
/** The app registers this so any 401 (expired or revoked sign-in) sends the person back to the login page. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || [];
  }

  /** { fieldName: "message" } for showing errors next to form fields. */
  get fieldErrors() {
    const map = {};
    for (const d of this.details) if (d.field && !map[d.field]) map[d.field] = d.message;
    return map;
  }
}

/** The full address of a picture the backend serves (paths look like /media/products/...). */
export function mediaUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
}

function query(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function request(kind, method, path, { body, form, params, raw } = {}) {
  const session = readSession(kind);
  const headers = {};
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) {
    payload = form; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}${query(params)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the TSM server. Is the backend running (npm run dev in the backend folder)?');
  }
  if (raw && response.ok) return response;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!response.ok) {
    const e = json?.error;
    if (response.status === 401 && session?.token) onUnauthorized(kind);
    throw new ApiError(response.status, e?.code || 'error', e?.message || `Something went wrong (${response.status})`, e?.details);
  }
  return json;
}

/** Returns { get, post, patch, put, del, upload, blob } bound to one kind of sign-in. */
function client(kind) {
  return {
    get: (path, params) => request(kind, 'GET', path, { params }),
    post: (path, body) => request(kind, 'POST', path, { body: body ?? {} }),
    patch: (path, body) => request(kind, 'PATCH', path, { body }),
    del: (path) => request(kind, 'DELETE', path),
    upload: (path, form) => request(kind, 'POST', path, { form }),
    /** Downloads a protected file (e.g. a seller's permit) and opens it in a new tab. */
    async openFile(path) {
      const response = await request(kind, 'GET', path, { raw: true });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}

export const staffApi = client('staff');
export const sellerApi = client('seller');

/** Everyone-can-call endpoints (the shop), no sign-in needed. */
export const publicApi = {
  get: (path, params) => request('none', 'GET', path, { params }),
  post: (path, body) => request('none', 'POST', path, { body: body ?? {} }),
};
