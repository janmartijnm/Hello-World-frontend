import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, ChevronsUpDown, LogOut, Plus } from 'lucide-react';

import { getAuthState, logout, onAuthChange, serverColor, serverLabel, startAdding, switchTo } from '../api';

/**
 * The NetBox servers you are logged in to, at the top of the sidebar: switch between them, sign out of one, or log
 * in to one more. Each server keeps its own login, so switching needs no password.
 */
export function InstanceSwitcher() {
  const state = useSyncExternalStore(onAuthChange, getAuthState);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const active = state.active;
  if (!active) return null;

  // Object pages (e.g. /devices/12) mean another object on another server: go to the same list instead
  const sectionPath = () => {
    const section = location.pathname.split('/')[1];
    return section && section !== 'search' ? `/${section}` : '/';
  };

  const switchServer = (server: string) => {
    setOpen(false);
    if (server === active.server) return;
    navigate(sectionPath());
    switchTo(server);
  };

  const signOut = (server: string) => {
    if (server === active.server) navigate('/');
    logout(server);
  };

  return (
    <div className="instance" ref={box}>
      <button
        type="button"
        className="instance-current"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`${active.displayName} on ${active.server}`}
      >
        <i className="instance-dot" style={{ background: serverColor(active.server) }} />
        <span className="instance-text">
          <strong>{serverLabel(active.server)}</strong>
          <small>{active.displayName}</small>
        </span>
        <ChevronsUpDown size={14} />
      </button>
      {open && (
        <div className="instance-menu" role="menu">
          <div className="instance-menu-title">NetBox instances</div>
          {state.sessions.map((a) => (
            <div key={a.server} className={a.server === active.server ? 'instance-item active' : 'instance-item'}>
              <button type="button" role="menuitem" className="instance-pick" onClick={() => switchServer(a.server)}>
                <i className="instance-dot" style={{ background: serverColor(a.server) }} />
                <span className="instance-text">
                  <strong>{serverLabel(a.server)}</strong>
                  <small>{a.displayName}</small>
                </span>
                {a.server === active.server && <Check size={14} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                title={`Sign out of ${serverLabel(a.server)}`}
                aria-label={`Sign out of ${serverLabel(a.server)}`}
                onClick={() => signOut(a.server)}
              >
                <LogOut size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            role="menuitem"
            className="instance-add"
            onClick={() => {
              setOpen(false);
              startAdding();
            }}
          >
            <Plus size={14} /> Add NetBox…
          </button>
        </div>
      )}
    </div>
  );
}
