import { Link } from 'react-router';

import { ListView, type Column, type FilterDef } from '../components/list';
import { PageHeader, RefLink, StatusBadge } from '../components/ui';
import type { Device } from '../types';
import { choice } from '../utils';

export const DEVICE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'offline', label: 'Offline' },
  { value: 'planned', label: 'Planned' },
  { value: 'staged', label: 'Staged' },
  { value: 'failed', label: 'Failed' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'decommissioning', label: 'Decommissioning' },
];

const FILTERS: FilterDef[] = [
  { name: 'site_id', label: 'Site', source: 'dcim/sites/' },
  { name: 'role_id', label: 'Role', source: 'dcim/device-roles/' },
  { name: 'status', label: 'Status', options: DEVICE_STATUSES },
];

const ip = (d: Device) => (d.primary_ip4 ?? d.primary_ip6)?.display?.split('/')[0];

export const DEVICE_COLUMNS: Column<Device>[] = [
  {
    key: 'name',
    header: 'Name',
    sort: 'name',
    render: (d) => <Link to={`/devices/${d.id}`}>{d.display}</Link>,
    csv: (d) => d.name,
  },
  { key: 'status', header: 'Status', sort: 'status', render: (d) => <StatusBadge status={d.status} />, csv: (d) => choice(d.status)?.label },
  { key: 'site', header: 'Site', sort: 'site', render: (d) => <RefLink obj={d.site} to={`/sites/${d.site.id}`} />, csv: (d) => d.site.display },
  { key: 'role', header: 'Role', sort: 'role', render: (d) => d.role.display, csv: (d) => d.role.display },
  {
    key: 'type',
    header: 'Device type',
    sort: 'device_type',
    render: (d) => `${d.device_type.manufacturer.display} ${d.device_type.model}`,
    csv: (d) => `${d.device_type.manufacturer.display} ${d.device_type.model}`,
    className: 'hide-mobile',
  },
  { key: 'serial', header: 'Serial', sort: 'serial', render: (d) => <span className="mono">{d.serial}</span>, csv: (d) => d.serial, className: 'hide-mobile' },
  { key: 'ip', header: 'Primary IP', render: (d) => <span className="mono">{ip(d)}</span>, csv: (d) => ip(d), className: 'hide-mobile' },
  { key: 'interfaces', header: 'Interfaces', render: (d) => d.interface_count ?? '', csv: (d) => d.interface_count, className: 'num hide-mobile' },
];

export function Devices() {
  return (
    <>
      <PageHeader title="Devices" />
      <ListView<Device>
        path="dcim/devices/"
        columns={DEVICE_COLUMNS}
        filters={FILTERS}
        rowLink={(d) => `/devices/${d.id}`}
        exportName="devices"
        placeholder="Name, serial, asset tag…"
      />
    </>
  );
}
