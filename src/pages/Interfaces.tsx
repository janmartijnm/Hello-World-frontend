import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';

import { fetchAll, type Params } from '../api';
import {
  DataTable,
  FilterBar,
  ListBody,
  Pagination,
  useListState,
  usePage,
  type Column,
  type FilterDef,
} from '../components/list';
import { ColorBadge, Dash, PageHeader } from '../components/ui';
import type { Interface, IPAddress, Service } from '../types';
import { choice, downloadCsv, today, type CsvColumn } from '../utils';
import { SERVICES, useServiceColors } from './Services';

const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const FILTERS: FilterDef[] = [
  { name: 'site_id', label: 'Site', source: 'dcim/sites/' },
  { name: 'device_role_id', label: 'Device role', source: 'dcim/device-roles/' },
  {
    name: 'kind',
    label: 'Kind',
    options: [
      { value: 'physical', label: 'Physical' },
      { value: 'virtual', label: 'Virtual' },
      { value: 'wireless', label: 'Wireless' },
    ],
  },
  { name: 'enabled', label: 'Enabled', options: YES_NO },
  { name: 'cabled', label: 'Cabled', options: YES_NO },
];

const connectedTo = (i: Interface) => {
  const peer = i.connected_endpoints?.[0] ?? i.link_peers?.[0];
  if (!peer) return '';
  return peer.device ? `${peer.device.display} ${peer.display}` : peer.display;
};

/** Services and IP addresses of these interfaces (one request each, in chunks). */
async function extras(ids: number[]) {
  const services: Service[] = [];
  const ips: IPAddress[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [s, a] = await Promise.all([
      fetchAll<Service>(SERVICES, { interface_id: chunk }).catch(() => []),
      fetchAll<IPAddress>('ipam/ip-addresses/', { interface_id: chunk }).catch(() => []),
    ]);
    services.push(...s);
    ips.push(...a);
  }
  const serviceByInterface = new Map(services.filter((s) => s.interface).map((s) => [s.interface!.id, s]));
  const ipsByInterface = new Map<number, string[]>();
  for (const ip of ips) {
    if (ip.assigned_object_type !== 'dcim.interface' || !ip.assigned_object_id) continue;
    ipsByInterface.set(ip.assigned_object_id, [...(ipsByInterface.get(ip.assigned_object_id) ?? []), ip.address]);
  }
  return { serviceByInterface, ipsByInterface };
}

type Extras = Awaited<ReturnType<typeof extras>>;

function columns(x: Extras | undefined, levelColor: (id?: number) => string | undefined): Column<Interface>[] {
  const service = (i: Interface) => x?.serviceByInterface.get(i.id);
  const ips = (i: Interface) => (x?.ipsByInterface.get(i.id) ?? []).join(', ');
  return [
    {
      key: 'device',
      header: 'Device',
      sort: 'device',
      render: (i) => <Link to={`/devices/${i.device.id}`}>{i.device.display}</Link>,
      csv: (i) => i.device.display,
    },
    {
      key: 'name',
      header: 'Interface',
      sort: 'name',
      render: (i) => (
        <Link to={`/devices/${i.device.id}?interface=${i.id}`}>
          <strong>{i.name}</strong>
          {i.label && <span className="muted"> {i.label}</span>}
        </Link>
      ),
      csv: (i) => i.name,
    },
    {
      key: 'enabled',
      header: 'State',
      render: (i) => <span className={i.enabled ? 'dot on' : 'dot off'} title={i.enabled ? 'Enabled' : 'Disabled'} />,
      csv: (i) => (i.enabled ? 'enabled' : 'disabled'),
    },
    { key: 'type', header: 'Type', render: (i) => choice(i.type)?.label, csv: (i) => choice(i.type)?.label, className: 'hide-mobile' },
    { key: 'description', header: 'Description', render: (i) => i.description, csv: (i) => i.description },
    { key: 'ip', header: 'IP addresses', render: (i) => <span className="mono">{ips(i)}</span>, csv: ips },
    { key: 'peer', header: 'Connected to', render: connectedTo, csv: connectedTo, className: 'hide-mobile' },
    { key: 'vlan', header: 'VLAN', render: (i) => i.untagged_vlan?.display ?? '', csv: (i) => i.untagged_vlan?.display, className: 'hide-mobile' },
    { key: 'vrf', header: 'VRF', render: (i) => i.vrf?.display ?? '', csv: (i) => i.vrf?.display, className: 'hide-mobile' },
    {
      key: 'service',
      header: 'Service',
      render: (i) => {
        const s = service(i);
        if (!s) return <Dash />;
        return (
          <span className="badge-row">
            <Link to={`/services/${s.id}`} className="mono">
              {s.service_id}
            </Link>
            {s.level && <ColorBadge label={s.level.display} color={levelColor(s.level.id)} />}
          </span>
        );
      },
      csv: (i) => service(i)?.service_id,
    },
    { key: 'level', header: 'Service level', render: () => null, csv: (i) => service(i)?.level?.display, className: 'hidden' },
  ];
}

/** Every interface matching the filters, with their IP addresses and services, as CSV. */
function ExportInterfaces({ params }: { params: Params }) {
  const colors = useServiceColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const rows = await fetchAll<Interface>('dcim/interfaces/', params);
            const x = await extras(rows.map((r) => r.id));
            const csv: CsvColumn<Interface>[] = columns(x, colors.level)
              .filter((c) => c.csv)
              .map((c) => ({ header: c.header, value: c.csv! }));
            await downloadCsv(`interfaces-${today()}.csv`, csv, rows);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} /> {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      {error && <span className="error-text">{error}</span>}
    </>
  );
}

export function Interfaces() {
  const state = useListState(FILTERS);
  const page = usePage<Interface>('dcim/interfaces/', state);
  const colors = useServiceColors();
  const ids = useMemo(() => (page.data?.results ?? []).map((i) => i.id), [page.data]);
  // IP addresses and services of the interfaces on this page
  const x = useQuery({
    queryKey: ['interface-extras', ids],
    queryFn: () => extras(ids),
    enabled: ids.length > 0,
  });

  return (
    <>
      <PageHeader title="Interfaces" subtitle={page.data ? `${page.data.count} interfaces` : undefined} />
      <FilterBar filters={FILTERS} state={state} placeholder="Name, label, description, device…">
        <ExportInterfaces params={{ ...state.apiFilters, ordering: state.sort || undefined }} />
      </FilterBar>
      <ListBody data={page.data} error={page.error} isPending={page.isPending} isFetching={page.isFetching}>
        {(rows) => (
          <DataTable
            columns={columns(x.data, colors.level)}
            rows={rows}
            state={state}
            rowLink={(i) => `/devices/${i.device.id}?interface=${i.id}`}
          />
        )}
      </ListBody>
      {page.data && page.data.count > 0 && <Pagination state={state} count={page.data.count} />}
    </>
  );
}
