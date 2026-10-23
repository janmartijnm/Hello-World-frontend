import { useState } from 'react';
import { LogIn, X } from 'lucide-react';

import {
  cancelAdding,
  config,
  forgetServer,
  isTauri,
  login,
  recentServers,
  serverLabel,
  switchTo,
  type AuthState,
  type RecentServer,
} from '../api';

export function Login({ state }: { state: AuthState }) {
  const [recent, setRecent] = useState<RecentServer[]>(recentServers);
  const loggedIn = (server: string) => state.sessions.some((a) => a.server === server);
  // Suggest the server whose session expired, else the most recent one not logged in to yet
  const last =
    recent.find((r) => r.server === state.expiredServer) ?? recent.find((r) => !loggedIn(r.server)) ?? (state.adding ? undefined : recent[0]);
  const [server, setServer] = useState(last?.server ?? '');
  const [username, setUsername] = useState(last?.username ?? '');
  const [password, setPassword] = useState('');
  const [selfSigned, setSelfSigned] = useState(last?.allowSelfSigned ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (r: RecentServer) => {
    setServer(r.server);
    setUsername(r.username);
    setSelfSigned(r.allowSelfSigned);
    setPassword('');
  };

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await login(server, username.trim(), password, selfSigned);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <img src="/favicon.svg" alt="" width={44} height={44} />
        <h1>NetBox Explorer</h1>
        <p className="muted">
          {state.expiredServer
            ? `Your login on ${serverLabel(state.expiredServer)} has expired. Log in again.`
            : state.adding
              ? 'Log in to one more NetBox server. You stay logged in to the others.'
              : 'Log in to a NetBox server with your NetBox account.'}
        </p>

        {recent.length > 0 && (
          <div className="recent">
            <span className="muted small">Recent servers</span>
            {recent.map((r) => (
              <div key={r.server} className={r.server === server ? 'recent-item active' : 'recent-item'}>
                <button type="button" className="link" onClick={() => pick(r)} title={`${r.username} on ${r.server}`}>
                  {serverLabel(r.server)}
                </button>
                {loggedIn(r.server) && <span className="muted small">logged in</span>}
                <button
                  type="button"
                  className="icon-btn"
                  title="Forget this server"
                  aria-label={`Forget ${r.server}`}
                  onClick={() => {
                    forgetServer(r.server);
                    setRecent(recentServers());
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <label>
          <span>NetBox server</span>
          <input
            autoFocus={!server}
            value={server}
            placeholder="netbox.example.com"
            onChange={(e) => setServer(e.target.value)}
            required={isTauri}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          <span>Username</span>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input
            autoFocus={Boolean(server)}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={selfSigned} onChange={(e) => setSelfSigned(e.target.checked)} />
          <span>Allow a self-signed certificate (only for a server you trust)</span>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          <LogIn size={16} /> {busy ? 'Logging in…' : 'Log in'}
        </button>
        {state.adding && state.active && (
          <button type="button" className="btn" onClick={cancelAdding}>
            Back to {serverLabel(state.active.server)}
          </button>
        )}
        {!state.active && state.sessions.length > 0 && (
          <div className="recent">
            <span className="muted small">Or continue with</span>
            {state.sessions.map((a) => (
              <button key={a.server} type="button" className="link" onClick={() => switchTo(a.server)}>
                {serverLabel(a.server)} ({a.displayName})
              </button>
            ))}
          </div>
        )}
        <p className="muted small">
          Read-only: you see what your NetBox permissions allow. You stay logged in for {config.tokenHours} hours. To
          change data, use NetBox itself.
        </p>
      </form>
    </div>
  );
}
