import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { netboxLink } from '../api';
import { ListView, type Column, type FilterDef } from '../components/list';
import { Dash, PageHeader, RefLink, StatusBadge } from '../components/ui';
import type { Asset } from '../types';
import { choice, date } from '../utils';

// The netbox-inventory plugin's assets
export const ASSETS = 'plugins/inventory/assets/';

export const ASSET_STATUSES = [
  { value: 'stored', label: 'Stored' },
  { value: 'used', label: 'Used' },
  { value: 'retired', label: 'Retired' },
];

export const ASSET_KINDS = [
  { value: 'device', label: 'Device' },
  { value: 'module', label: 'Module' },
  { value: 'inventoryitem', label: 'Inventory item' },
  { value: 'rack', label: 'Rack' },
];

const FILTERS: FilterDef[] = [
  { name: 'status', label: 'Status', options: ASSET_STATUSES },
  { name: 'kind', label: 'Kind', options: ASSET_KINDS },
  { name: 'role_id', label: 'Role', source: 'plugins/inventory/asset-roles/' },
  { name: 'manufacturer_id', label: 'Manufacturer', source: 'dcim/manufacturers/' },
  { name: 'located_site_id', label: 'Site (installed or stored)', source: 'dcim/sites/' },
  {
    name: 'is_assigned',
    label: 'Assigned',
    options: [
      { value: 'true', label: 'Assigned to hardware' },
      { value: 'false', label: 'Not assigned' },
    ],
  },
  { name: 'supplier_id', label: 'Supplier', source: 'plugins/inventory/suppliers/' },
];

/** "Cisco C9300": the asset's device, module, inventory item or rack type. */
export function assetType(a: Asset): string {
  const t = a.device_type ?? a.module_type ?? a.inventoryitem_type ?? a.rack_type;
  if (!t) return '';
  return [t.manufacturer?.display, t.display].filter(Boolean).join(' ');
}

/** The hardware the asset is assigned to: a link to its page here (devices) or in NetBox. */
export function AssignedTo({ asset }: { asset: Asset }) {
  if (asset.device) return <Link to={`/devices/${asset.device.id}`}>{asset.device.display}</Link>;
  const other = asset.module ?? asset.inventoryitem ?? asset.rack;
  if (!other) return <Dash />;
  return (
    <a href={netboxLink(other.display_url ?? other.url)} target="_blank" rel="noreferrer">
      {other.display}
    </a>
  );
}

export const assignedText = (a: Asset) => (a.device ?? a.module ?? a.inventoryitem ?? a.rack)?.display ?? '';

/** Warranty end date with a warning when it has passed or is close. */
export function Warranty({ end }: { end: string | null }): ReactNode {
  if (!end) return <Dash />;
  const days = Math.ceil((new Date(`${end}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  let note: ReactNode = null;
  if (days < 0) note = <span className="badge tone-red">expired</span>;
  else if (days <= 90) note = <span className="badge tone-orange">{days} days left</span>;
  return (
    <span className="badge-row">
      {date(end)} {note}
    </span>
  );
}

export const ASSET_COLUMNS: Column<Asset>[] = [
  { key: 'name', header: 'Name', sort: 'name', render: (a) => <Link to={`/assets/${a.id}`}>{a.display}</Link>, csv: (a) => a.name },
  { key: 'asset_tag', header: 'Asset tag', sort: 'asset_tag', render: (a) => <span className="mono">{a.asset_tag}</span>, csv: (a) => a.asset_tag },
  { key: 'serial', header: 'Serial', sort: 'serial', render: (a) => <span className="mono">{a.serial}</span>, csv: (a) => a.serial },
  { key: 'status', header: 'Status', sort: 'status', render: (a) => <StatusBadge status={a.status} />, csv: (a) => choice(a.status)?.label },
  { key: 'kind', header: 'Kind', sort: 'kind', render: (a) => choice(a.kind)?.label, csv: (a) => choice(a.kind)?.label, className: 'hide-mobile' },
  { key: 'type', header: 'Type', render: assetType, csv: assetType, className: 'hide-mobile' },
  { key: 'assigned', header: 'Assigned to', render: (a) => <AssignedTo asset={a} />, csv: assignedText },
  {
    key: 'storage',
    header: 'Storage location',
    render: (a) => <RefLink obj={a.storage_location} />,
    csv: (a) => a.storage_location?.display,
    className: 'hide-mobile',
  },
  { key: 'tenant', header: 'Tenant', sort: 'tenant', render: (a) => <RefLink obj={a.tenant} />, csv: (a) => a.tenant?.display, className: 'hide-mobile' },
  { key: 'warranty_end', header: 'Warranty end', sort: 'warranty_end', render: (a) => <Warranty end={a.warranty_end} />, csv: (a) => a.warranty_end },
  // Only in the CSV export
  { key: 'role', header: 'Role', render: () => null, csv: (a) => a.role?.display, className: 'hidden' },
  { key: 'owning_tenant', header: 'Owner', render: () => null, csv: (a) => a.owning_tenant?.display, className: 'hidden' },
  { key: 'purchase', header: 'Purchase', render: () => null, csv: (a) => a.purchase?.display, className: 'hidden' },
  { key: 'delivery', header: 'Delivery', render: () => null, csv: (a) => a.delivery?.display, className: 'hidden' },
  { key: 'warranty_start', header: 'Warranty start', render: () => null, csv: (a) => a.warranty_start, className: 'hidden' },
  { key: 'uuid', header: 'UUID', render: () => null, csv: (a) => a.custom_fields?.UUID as string, className: 'hidden' },
];

export function Assets() {
  return (
    <>
      <PageHeader title="Inventory" subtitle="Assets from the netbox-inventory plugin" />
      <ListView<Asset>
        path={ASSETS}
        columns={ASSET_COLUMNS}
        filters={FILTERS}
        rowLink={(a) => `/assets/${a.id}`}
        exportName="assets"
        placeholder="Name, serial, asset tag…"
      />
    </>
  );
}
