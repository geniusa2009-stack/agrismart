const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const TOKEN_KEY = 'agrismart_access_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, json?.error?.code);
  }

  return json?.data;
}

/**
 * Same as `request()` but preserves the `pagination` envelope the new
 * Community-layer list endpoints return alongside `data` (see
 * agrismart-backend's utils/pagination.js) — the plain `request()`
 * above discards everything except `data`, which is fine for the
 * pre-existing IoT endpoints (none of them paginate), but the
 * Community feed / equipment discovery / rentals lists need page info
 * for "load more" / page controls.
 */
async function requestPaginated(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, json?.error?.code);
  }

  return { items: json?.data || [], pagination: json?.pagination || null };
}

/**
 * Notifications-only variant: GET /notifications is the one endpoint
 * that returns a THIRD top-level field (`unreadCount`) alongside
 * `data`/`pagination` (see notifications.controller.js's `list`) — a
 * dedicated helper keeps requestPaginated()'s shape (items/pagination)
 * stable for every other paginated list endpoint instead of bolting an
 * optional field onto it for one caller.
 */
async function requestNotifications(path) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'GET', headers });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, json?.error?.code);
  }

  return { items: json?.data || [], pagination: json?.pagination || null, unreadCount: json?.unreadCount ?? 0 };
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  getPaginated: (path) => requestPaginated(path, { method: 'GET' }),
  getNotifications: (path) => requestNotifications(path),
};

export { ApiError, API_BASE_URL };
