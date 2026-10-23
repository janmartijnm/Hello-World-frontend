/**
 * NetBox REST API access for the desktop app. The user picks a NetBox server on the login screen and logs in with
 * their own account; the app gets a personal, read-only API token that expires, so NetBox's permissions decide what
 * they see.
 *
 * In the app, requests go through Tauri's HTTP client (in Rust), so NetBox needs no CORS settings. In a plain
 * browser (npm run dev), they go to /api/ on the dev server, which forwards them to NETBOX_UPSTREAM.
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const isTauri = '__TAURI_INTERNALS__' in window;

export const config = {
  /** NetBox's web interface, for "Open in NetBox" links: the server the user logged in to. */
  get netboxUrl(): string {
    return stored.sessions.find((a) => a.server === stored.active)?.server || '';
  },
  mapTiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  tokenHours: 8,
};

/**
 * The NetBox page of an object, from its display_url, or from its API url ("/api/dcim/devices/1/" ->
 * "/dcim/devices/1/") for plugins whose API has no display_url.
 */
export function netboxLink(displayUrl?: string | null): string {
  if (!displayUrl) return config.netboxUrl;
  const url = new URL(displayUrl, config.netboxUrl || location.origin);
  return config.netboxUrl + url.pathname.replace(/^\/api\//, '/') + url.search;
}

/** "netbox.example.com" -> "https://netbox.example.com"; trailing "/" and "/api" removed. */
export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
  const url = new URL(s);
  return url.origin + url.pathname.replace(/\/+$/, '');
}

// Servers used before, newest first, for the login screen
export interface RecentServer {
  server: string;
  username: string;
  allowSelfSigned: boolean;
}

const RECENT_KEY = 'netbox-explorer.recent';

export function recentServers(): RecentServer[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function rememberServer(entry: RecentServer) {
  const list = [entry, ...recentServers().filter((r) => r.server !== entry.server)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Not remembered
  }
}

export function forgetServer(server: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentServers().filter((r) => r.server !== server)));
  } catch {
    // Nothing to forget
  }
}

/** A request to NetBox: through the app's HTTP client, or the dev server in a browser. */
function request(server: string, allowSelfSigned: boolean, path: string, init: RequestInit = {}): Promise<Response> {
  if (!isTauri) return fetch(`/api/${path}`, init);
  return tauriFetch(`${server}/api/${path}`, {
    ...init,
    connectTimeout: 15_000,
    ...(allowSelfSigned ? { danger: { acceptInvalidCerts: true, acceptInvalidHostnames: false } } : {}),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Login: one session (read-only token) per NetBox server; one of them is active

export interface Auth {
  server: string;
  allowSelfSigned: boolean;
  token: string;
  expires: string;
  username: string;
  displayName: string;
}

interface Stored {
  active: string | null;
  sessions: Auth[];
}

/** What the screens need: the active session, all sessions, and whether the login screen is wanted. */
export interface AuthState {
  active: Auth | null;
  sessions: Auth[];
  /** Logging in to one more server (the login screen is shown on top of the active session) */
  adding: boolean;
  /** Server whose session just expired, to fill in on the login screen */
  expiredServer: string | null;
}

const AUTH_KEY = 'netbox-explorer.sessions';
const OLD_AUTH_KEY = 'netbox-explorer.auth';

const valid = (a: Auth) => new Date(a.expires) > new Date();

function readStored(): Stored {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') as Stored | null;
    if (stored) {
      // The active server's login expired while the app was closed: ask to log in to it again
      const lost = stored.sessions.find((a) => a.server === stored.active && !valid(a));
      if (lost) expiredServer = lost.server;
      return { active: lost ? null : stored.active, sessions: stored.sessions.filter(valid) };
    }
    // Version 0.1 kept a single session
    const old = JSON.parse(localStorage.getItem(OLD_AUTH_KEY) || 'null') as Auth | null;
    localStorage.removeItem(OLD_AUTH_KEY);
    if (old?.server && valid(old)) return { active: old.server, sessions: [old] };
  } catch {
    // Storage unavailable or damaged: log in again
  }
  return { active: null, sessions: [] };
}

let adding = false;
let expiredServer: string | null = null;
let stored = readStored();
let snapshot: AuthState = buildSnapshot();
const listeners = new Set<() => void>();

function buildSnapshot(): AuthState {
  const active = stored.sessions.find((a) => a.server === stored.active) ?? null;
  return { active, sessions: stored.sessions, adding, expiredServer };
}

function save(next: Stored) {
  stored = next;
  // Signed out of the active server: another logged-in server becomes active (null = show the login screen)
  if (stored.active && !stored.sessions.some((a) => a.server === stored.active)) {
    stored.active = stored.sessions[0]?.server ?? null;
  }
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(stored));
  } catch {
    // Not persisted; this window still works
  }
  changed();
}

function changed() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
}

export function getAuthState(): AuthState {
  return snapshot;
}

/** Drop sessions that expired while the app was open (every 30 s, and before each request). */
function checkExpiry() {
  if (!stored.sessions.some((a) => !valid(a))) return;
  const lost = stored.sessions.find((a) => !valid(a) && a.server === stored.active);
  if (lost) expiredServer = lost.server;
  save({ active: lost ? null : stored.active, sessions: stored.sessions.filter(valid) });
}
setInterval(checkExpiry, 30_000);

/** The active session (or null). */
export function getAuth(): Auth | null {
  return getAuthState().active;
}

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Make another logged-in server the active one. */
export function switchTo(server: string) {
  if (!stored.sessions.some((a) => a.server === server)) return;
  adding = false;
  expiredServer = null;
  save({ ...stored, active: server });
}

/** Show the login screen to add a server, keeping the current sessions. */
export function startAdding() {
  adding = true;
  changed();
}

export function cancelAdding() {
  adding = false;
  expiredServer = null;
  changed();
}

/** A short, stable colour per server, to tell them apart in the sidebar. */
export function serverColor(server: string): string {
  const palette = ['#2f6fde', '#e8743b', '#19a979', '#d64e9a', '#945ecf', '#13a4b4', '#bf9d00', '#6f7d8c'];
  let h = 0;
  for (const c of server) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export const serverLabel = (server: string) => server.replace(/^https?:\/\//, '');

export async function login(serverInput: string, username: string, password: string, allowSelfSigned: boolean): Promise<void> {
  let server: string;
  try {
    server = normalizeServer(serverInput);
  } catch {
    throw new Error('That is not a valid server address.');
  }
  const expires = new Date(Date.now() + config.tokenHours * 3600_000).toISOString();
  let response: Response;
  try {
    response = await request(server, allowSelfSigned, 'users/tokens/provision/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        username,
        password,
        expires,
        write_enabled: false,
        description: 'NetBox Explorer login',
      }),
    });
  } catch (e) {
    const text = String(e);
    if (/certificate|ssl|tls/i.test(text)) {
      throw new Error(`The server's certificate is not trusted. If it is self-signed, tick "Allow a self-signed certificate". (${text})`);
    }
    const hint =
      server.startsWith('https:') && !allowSelfSigned
        ? ' If the server uses a self-signed certificate, tick "Allow a self-signed certificate".'
        : '';
    throw new Error(`Can't reach ${server}.${hint} (${text})`);
  }
  if (response.status === 403 || response.status === 401) throw new Error('Wrong username or password.');
  if (response.status === 404) throw new Error(`${server} does not look like NetBox (no API found).`);
  if (!response.ok) throw new Error(`NetBox answered ${response.status}.`);
  const data = await response.json();
  if (data.version !== 2 && !data.key) throw new Error('Unexpected answer from NetBox. NetBox 4.5 or newer is needed.');
  // NetBox 4.5+ (v2) tokens are "nbt_<key>.<token>" and use "Bearer"; older ones are a plain key with "Token"
  const token = data.version === 2 ? `Bearer nbt_${data.key}.${data.token}` : `Token ${data.key}`;
  rememberServer({ server, username, allowSelfSigned });
  const auth: Auth = {
    server,
    allowSelfSigned,
    token,
    expires: data.expires || expires,
    username,
    displayName: data.user?.display || username,
  };
  adding = false;
  expiredServer = null;
  // Logging in to a server again replaces its session
  save({ active: server, sessions: [...stored.sessions.filter((a) => a.server !== server), auth] });
}

/**
 * Forgets a server's token (default: the active one); another logged-in server becomes active. The token stays
 * valid in NetBox until it expires: being read-only, it may not delete itself.
 */
export function logout(server = stored.active) {
  save({ ...stored, sessions: stored.sessions.filter((a) => a.server !== server) });
}

export function logoutAll() {
  save({ active: null, sessions: [] });
}

/** The active session's token expired or was removed in NetBox: ask to log in to it again. */
function sessionLost(server: string) {
  const wasActive = server === stored.active;
  if (wasActive) expiredServer = server;
  save({ active: wasActive ? null : stored.active, sessions: stored.sessions.filter((a) => a.server !== server) });
}

// ---------------------------------------------------------------------------------------------------------------
// Requests

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  get forbidden() {
    return this.status === 403;
  }
}

export type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function query(params?: Params): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, params?: Params): Promise<T> {
  checkExpiry();
  const auth = getAuth();
  if (!auth) throw new ApiError(401, 'Not logged in');
  const response = await request(auth.server, auth.allowSelfSigned, `${path}${query(params)}`, {
    headers: { Authorization: auth.token, Accept: 'application/json' },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      // Not JSON
    }
    // An expired or removed token: back to the login page
    if ((response.status === 401 || response.status === 403) && /token/i.test(detail)) sessionLost(auth.server);
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

/** Every object matching the filters (for exports and maps), 1000 per request. */
export async function fetchAll<T>(path: string, params?: Params, max = 20000): Promise<T[]> {
  const results: T[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const page = await api<Page<T>>(path, { ...params, limit: 1000, offset });
    results.push(...page.results);
    if (!page.next) break;
  }
  return results;
}
