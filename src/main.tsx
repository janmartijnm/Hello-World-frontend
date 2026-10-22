import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { openUrl } from '@tauri-apps/plugin-opener';

import { ApiError, getAuth, isTauri, onAuthChange } from './api';
import { Layout } from './components/Layout';
import { AssetDetail } from './pages/AssetDetail';
import { Assets } from './pages/Assets';
import { DeviceDetail } from './pages/DeviceDetail';
import { Devices } from './pages/Devices';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { SearchPage } from './pages/Search';
import { ServiceDetail } from './pages/ServiceDetail';
import { Services } from './pages/Services';
import { SiteDetail } from './pages/SiteDetail';
import { Sites } from './pages/Sites';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // Don't retry what NetBox refused (no permission, not found)
      retry: (count, error) => !(error instanceof ApiError) && count < 2,
    },
  },
});

function App() {
  const auth = useSyncExternalStore(onAuthChange, getAuth);
  if (!auth) {
    queryClient.clear();
    return <Login />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="sites" element={<Sites />} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="devices" element={<Devices />} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="assets" element={<Assets />} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
