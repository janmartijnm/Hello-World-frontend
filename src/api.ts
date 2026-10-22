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
    return current?.server || '';
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
// Login

export interface Auth {
  server: string;
  allowSelfSigned: boolean;
  token: string;
  expires: string;
  username: string;
  displayName: string;
}

const AUTH_KEY = 'netbox-explorer.auth';

function readAuth(): Auth | null {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') as Auth | null;
    if (auth && new Date(auth.expires) > new Date()) return auth;
  } catch {
    // Storage unavailable or damaged: log in again
  }
  return null;
}

let current: Auth | null = readAuth();
const listeners = new Set<() => void>();

export function getAuth(): Auth | null {
  if (current && new Date(current.expires) <= new Date()) setAuth(null);
  return current;
}

function setAuth(auth: Auth | null) {
  current = auth;
  try {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    // Not persisted; this tab still works
  }
  listeners.forEach((fn) => fn());
}

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

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
  setAuth({
    server,
    allowSelfSigned,
    token,
    expires: data.expires || expires,
    username,
    displayName: data.user?.display || username,
  });
}

/**
 * Forgets the token. It stays valid in NetBox until it expires: being read-only, it may not delete itself (and
 * nothing else can read it, it only lived in this browser).
 */
export function logout() {
  setAuth(null);
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
    if ((response.status === 401 || response.status === 403) && /token/i.test(detail)) setAuth(null);
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
