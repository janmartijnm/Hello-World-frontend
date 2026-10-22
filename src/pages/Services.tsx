import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { fetchAll } from '../api';
import { ListView, type Column, type FilterDef } from '../components/list';
import { ColorBadge, Dash, PageHeader, RefLink, StatusBadge } from '../components/ui';
import type { Service, ServiceLevel, ServiceType } from '../types';
import { choice, percent, speed } from '../utils';

export const SERVICES = 'plugins/service-management/services/';

export const SERVICE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'provisioning', label: 'Provisioning' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deprovisioning', label: 'Deprovisioning' },
  { value: 'decommissioned', label: 'Decommissioned' },
];

const FILTERS: FilterDef[] = [
  { name: 'type_id', label: 'Service type', source: 'plugins/service-management/service-types/' },
  { name: 'level_id', label: 'Service level', source: 'plugins/service-management/service-levels/' },
  { name: 'status', label: 'Status', options: SERVICE_STATUSES },
];

/** Colors of service types and levels (the service itself only carries their names). */
export function useServiceColors() {
  const types = useQuery({
    queryKey: ['service-types'],
    queryFn: () => fetchAll<ServiceType>('plugins/service-management/service-types/'),
    staleTime: 5 * 60_000,
  });
  const levels = useQuery({
    queryKey: ['service-levels'],
    queryFn: () => fetchAll<ServiceLevel>('plugins/service-management/service-levels/'),
    staleTime: 5 * 60_000,
  });
  return {
    type: (id?: number) => types.data?.find((t) => t.id === id)?.color,
    level: (id?: number) => levels.data?.find((l) => l.id === id)?.color,
    levels: levels.data ?? [],
  };
}

/** The device a service is on: its own device, or its interface's device. */
export const serviceDevice = (s: Service) => s.device ?? s.interface?.device ?? null;

export function useServiceColumns(): Column<Service>[] {
  const colors = useServiceColors();
  return [
    {
      key: 'service_id',
      header: 'Service ID',
      sort: 'service_id',
      render: (s) => (
        <Link to={`/services/${s.id}`} className="mono">
          {s.service_id}
        </Link>
      ),
      csv: (s) => s.service_id,
    },
    { key: 'name', header: 'Name', sort: 'name', render: (s) => s.name, csv: (s) => s.name },
    {
      key: 'type',
      header: 'Type',
      sort: 'type',
      render: (s) => <ColorBadge label={s.type.display} color={colors.type(s.type.id)} />,
      csv: (s) => s.type.display,
    },
    {
      key: 'level',
      header: 'Service level',
      sort: 'level',
      render: (s) => (s.level ? <ColorBadge label={s.level.display} color={colors.level(s.level.id)} /> : <Dash />),
      csv: (s) => s.level?.display,
    },
    { key: 'status', header: 'Status', sort: 'status', render: (s) => <StatusBadge status={s.status} />, csv: (s) => choice(s.status)?.label },
    {
      key: 'device',
      header: 'Device',
      render: (s) => {
        const d = serviceDevice(s);
        return <RefLink obj={d} to={d ? `/devices/${d.id}` : undefined} />;
      },
      csv: (s) => serviceDevice(s)?.display,
    },
    {
      key: 'interface',
      header: 'Interface',
      render: (s) =>
        s.interface ? <Link to={`/devices/${s.interface.device.id}?interface=${s.interface.id}`}>{s.interface.display}</Link> : <Dash />,
      csv: (s) => s.interface?.display,
    },
    { key: 'tenant', header: 'Tenant', sort: 'tenant', render: (s) => <RefLink obj={s.tenant} />, csv: (s) => s.tenant?.display, className: 'hide-mobile' },
    {
      key: 'availability',
      header: 'Availability',
      render: (s) => percent(s.effective_availability),
      csv: (s) => s.effective_availability,
      className: 'num hide-mobile',
    },
    {
      key: 'speed',
      header: 'Down / up',
      render: (s) => [speed(s.download_speed), speed(s.upload_speed)].filter(Boolean).join(' / '),
      className: 'hide-mobile',
    },
    { key: 'download', header: 'Download (Kbps)', render: () => null, csv: (s) => s.download_speed, className: 'hidden' },
    { key: 'upload', header: 'Upload (Kbps)', render: () => null, csv: (s) => s.upload_speed, className: 'hidden' },
  ];
}

export function Services() {
  const columns = useServiceColumns();
  return (
    <>
      <PageHeader title="Services" />
      <ListView<Service>
        path={SERVICES}
        columns={columns}
        filters={FILTERS}
        rowLink={(s) => `/services/${s.id}`}
        exportName="services"
        placeholder="Service ID, name, description…"
      />
    </>
  );
}
