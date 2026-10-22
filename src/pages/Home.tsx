import { Link } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Cable, Handshake, MapPin, Server } from 'lucide-react';

import { api, ApiError, fetchAll, getAuth, type Page } from '../api';
import { SiteMap } from '../components/SiteMap';
import { Card, ErrorState, PageHeader, Spinner } from '../components/ui';
import type { Site } from '../types';

const STATS = [
  { label: 'Sites', path: 'dcim/sites/', to: '/sites', icon: MapPin },
  { label: 'Devices', path: 'dcim/devices/', to: '/devices', icon: Server },
  { label: 'Interfaces', path: 'dcim/interfaces/', to: null, icon: Cable },
  { label: 'Services', path: 'plugins/service-management/services/', to: '/services', icon: Handshake },
];

export const MAP_FIELDS = 'id,name,display,facility,group,latitude,longitude,physical_address,status';

export function Home() {
  const counts = useQueries({
    queries: STATS.map((s) => ({
      queryKey: ['count', s.path],
      queryFn: () => api<Page<unknown>>(s.path, { limit: 1, brief: true }),
      staleTime: 5 * 60_000,
    })),
  });
  const sites = useQuery({
    queryKey: ['sites-map'],
    queryFn: () => fetchAll<Site>('dcim/sites/', { fields: MAP_FIELDS }),
  });
  const byGroup = new Map<string, number>();
  for (const s of sites.data ?? []) {
    const g = s.group?.display ?? 'No group';
    byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Overview" subtitle={`Logged in as ${getAuth()?.displayName}`} />

      <div className="stats">
        {STATS.map((s, i) => {
          const q = counts[i];
          if (q.error instanceof ApiError && q.error.forbidden) return null;
          const value = q.data ? q.data.count.toLocaleString('nl-NL') : q.isError ? '—' : '…';
          const body = (
            <>
              <s.icon size={20} />
              <div>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </>
          );
          return s.to ? (
            <Link key={s.label} to={s.to} className="stat">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="stat">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid-2-1">
        <Card title="Sites on the map" flush>
          {sites.error ? <ErrorState error={sites.error} /> : sites.data ? <SiteMap sites={sites.data} height={460} /> : <Spinner />}
        </Card>
        <Card title="Sites per site group">
          {sites.data && (
            <ul className="bars">
              {[...byGroup]
                .sort((a, b) => b[1] - a[1])
                .map(([group, n]) => (
                  <li key={group}>
                    <span>{group}</span>
                    <span className="bar">
                      <i style={{ width: `${(n / sites.data.length) * 100}%` }} />
                    </span>
                    <strong>{n}</strong>
                  </li>
                ))}
            </ul>
          )}
          {sites.error && <ErrorState error={sites.error} />}
        </Card>
      </div>
    </>
  );
}
