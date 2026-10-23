import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { openUrl } from '@tauri-apps/plugin-opener';

import { ApiError, getAuthState, isTauri, onAuthChange } from './api';
import { Layout } from './components/Layout';
import { AssetDetail } from './pages/AssetDetail';
import { Assets } from './pages/Assets';
import { DeviceDetail } from './pages/DeviceDetail';
import { Devices } from './pages/Devices';
import { Home } from './pages/Home';
import { Interfaces } from './pages/Interfaces';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { SearchPage } from './pages/Search';
import { ServiceDetail } from './pages/ServiceDetail';
import { Services } from './pages/Services';
import { SiteDetail } from './pages/SiteDetail';
import { Sites } from './pages/Sites';
import './styles.css';

// One data cache per NetBox server: data of one server never shows while looking at another, and switching back
// to a server shows its pages straight away
const clients = new Map<string, QueryClient>();

function clientFor(server: string): QueryClient {
  let client = clients.get(server);
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          refetchOnWindowFocus: false,
          // Don't retry what NetBox refused (no permission, not found)
          retry: (count, error) => !(error instanceof ApiError) && count < 2,
        },
      },
    });
    clients.set(server, client);
  }
  return client;
}

function App() {
  const state = useSyncExternalStore(onAuthChange, getAuthState);

  // Forget the data of servers that were signed out of
  for (const [server, client] of clients) {
    if (!state.sessions.some((a) => a.server === server)) {
      client.clear();
      clients.delete(server);
    }
  }

  if (!state.active || state.adding) return <Login state={state} />;
  return (
    <QueryClientProvider client={clientFor(state.active.server)} key={state.active.server}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="sites" element={<Sites />} />
          <Route path="sites/:id" element={<SiteDetail />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="interfaces" element={<Interfaces />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="assets" element={<Assets />} />
          <Route path="assets/:id" element={<AssetDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

// In the app, links to NetBox and other sites open in the default browser, not inside the app window
if (isTauri) {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || !/^https?:/i.test(a.href) || a.origin === location.origin) return;
    e.preventDefault();
    openUrl(a.href).catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
