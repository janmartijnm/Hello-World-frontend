import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { Boxes, ExternalLink, Handshake, LayoutDashboard, LogOut, MapPin, Menu, Moon, Search, Server, Sun, X } from 'lucide-react';

import { api, ApiError, config, getAuthState, logout, logoutAll, onAuthChange, serverLabel, type Page } from '../api';
import { InstanceSwitcher } from './InstanceSwitcher';
import { CommandPalette } from './CommandPalette';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('netbox-explorer.theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // No storage: follow the system
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/sites', label: 'Sites', icon: MapPin, path: 'dcim/sites/' },
  { to: '/devices', label: 'Devices', icon: Server, path: 'dcim/devices/' },
  { to: '/services', label: 'Services', icon: Handshake, path: 'plugins/service-management/services/' },
  { to: '/assets', label: 'Inventory', icon: Boxes, path: 'plugins/inventory/assets/' },
];

/** Menu items the user may view: NetBox refuses (403) the lists they may not see. */
function useVisibleNav() {
  const checks = useQueries({
    queries: NAV.map((item) => ({
      // Same query as the counts on the overview, so it is only asked once
      queryKey: ['count', item.path],
      queryFn: () => api<Page<unknown>>(item.path!, { limit: 1, brief: true }),
      enabled: Boolean(item.path),
      staleTime: 5 * 60_000,
    })),
  });
  return NAV.filter((_, i) => !(checks[i].error instanceof ApiError && checks[i].error.forbidden));
}

export function Layout() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const { active: auth, sessions } = useSyncExternalStore(onAuthChange, getAuthState);
  const navigate = useNavigate();
  const nav = useVisibleNav();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('netbox-explorer.theme', theme);
    } catch {
      // Not remembered
    }
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMenu(false), [location.pathname]);

  return (
    <div className="app">
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <img src="/favicon.svg" alt="" width={22} height={22} />
          <span>NetBox Explorer</span>
          <button type="button" className="icon-btn only-mobile" onClick={() => setMenu(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <InstanceSwitcher />
        <button type="button" className="side-search" onClick={() => setPalette(true)}>
          <span>Search</span>
          <Search size={14} />
        </button>
        <nav className="side-nav">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <nav className="side-nav side-foot">
          <a className="nav-link" href={config.netboxUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Open NetBox
          </a>
          <button type="button" className="nav-link" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              navigate('/');
              logout();
            }}
            title={`Sign out of ${auth?.server}`}
          >
            <LogOut size={16} /> Sign out of {serverLabel(auth?.server ?? '')}
          </button>
          {sessions.length > 1 && (
            <button
              type="button"
              className="nav-link"
              onClick={() => {
                navigate('/');
                logoutAll();
              }}
            >
              <LogOut size={16} /> Sign out of all ({sessions.length})
            </button>
          )}
        </nav>
      </aside>
      {menu && <div className="sidebar-backdrop" onClick={() => setMenu(false)} />}

      <div className="main">
        <header className="mobilebar only-mobile">
          <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <span className="mobilebar-title">NetBox Explorer</span>
          <button type="button" className="icon-btn" onClick={() => setPalette(true)} aria-label="Search">
            <Search size={18} />
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
