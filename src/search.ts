import { useQueries } from '@tanstack/react-query';

import { api, ApiError, netboxLink, type Page } from './api';
import type { Ref } from './types';
import { city } from './utils';

type Obj = any;

export interface SearchSource {
  key: string;
  label: string;
  path: string;
  fields: string;
  /** A page in the explorer, or null to open it in NetBox. */
  to: (o: Obj) => string | null;
  detail: (o: Obj) => string;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
const name = (r: Ref | null | undefined) => r?.display;

export const SOURCES: SearchSource[] = [
  {
    key: 'sites',
    label: 'Sites',
    path: 'dcim/sites/',
    fields: 'id,display,display_url,facility,physical_address,group',
    to: (o) => `/sites/${o.id}`,
    detail: (o) => join(o.facility, name(o.group), city(o.physical_address)),
  },
  {
    key: 'devices',
    label: 'Devices',
    path: 'dcim/devices/',
    fields: 'id,display,display_url,site,role,serial',
    to: (o) => `/devices/${o.id}`,
    detail: (o) => join(name(o.site), name(o.role), o.serial && `SN ${o.serial}`),
  },
  {
    key: 'interfaces',
    label: 'Interfaces',
    path: 'dcim/interfaces/',
    fields: 'id,display,display_url,device,description',
    to: (o) => `/devices/${o.device.id}?interface=${o.id}`,
    detail: (o) => join(name(o.device), o.description),
  },
  {
    key: 'services',
    label: 'Services',
    path: 'plugins/service-management/services/',
    fields: 'id,display,display_url,service_id,name,type',
    to: (o) => `/services/${o.id}`,
    detail: (o) => join(name(o.type), o.name),
  },
  {
    key: 'assets',
    label: 'Assets',
    path: 'plugins/inventory/assets/',
    fields: 'id,display,display_url,serial,asset_tag,device,storage_location',
    to: (o) => `/assets/${o.id}`,
    detail: (o) => join(o.serial && `SN ${o.serial}`, o.asset_tag, name(o.device) ?? name(o.storage_location)),
  },
  {
    key: 'ips',
    label: 'IP addresses',
    path: 'ipam/ip-addresses/',
    fields: 'id,display,display_url,assigned_object,dns_name,description',
    to: (o) => (o.assigned_object?.device ? `/devices/${o.assigned_object.device.id}` : null),
    detail: (o) =>
      join(o.assigned_object && `${o.assigned_object.device?.display ?? ''} ${o.assigned_object.display}`.trim(), o.dns_name, o.description),
  },
  {
    key: 'prefixes',
    label: 'Prefixes',
    path: 'ipam/prefixes/',
    fields: 'id,display,display_url,vrf,description',
    to: () => null,
    detail: (o) => join(name(o.vrf), o.description),
  },
  {
    key: 'circuits',
    label: 'Circuits',
    path: 'circuits/circuits/',
    fields: 'id,display,display_url,provider,description',
    to: () => null,
    detail: (o) => join(name(o.provider), o.description),
  },
];

export interface Hit {
  source: SearchSource;
  obj: Obj;
  to: string | null;
  href: string;
}

export interface SearchGroup {
  source: SearchSource;
  count: number;
  hits: Hit[];
}

/** Searches every source at once; sources the user may not see are left out. */
export function useSearch(q: string, limit: number) {
  const term = q.trim();
  const results = useQueries({
    queries: SOURCES.map((source) => ({
      queryKey: ['search', source.key, term, limit],
      queryFn: () => api<Page<Obj>>(source.path, { q: term, limit, fields: source.fields }),
      enabled: term.length >= 2,
      staleTime: 30_000,
      retry: (n: number, e: unknown) => !(e instanceof ApiError) && n < 1,
    })),
  });
  const groups: SearchGroup[] = [];
  results.forEach((r, i) => {
    if (!r.data?.count) return;
    const source = SOURCES[i];
    groups.push({
      source,
      count: r.data.count,
      hits: r.data.results.map((obj) => ({ source, obj, to: source.to(obj), href: netboxLink(obj.display_url) })),
    });
  });
  return {
    groups,
    loading: term.length >= 2 && results.some((r) => r.isFetching),
    tooShort: term.length < 2,
  };
}
