import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { api, fetchAll } from '../api';
import { CustomFields } from '../components/CustomFields';
import { DataTable, type Column } from '../components/list';
import {
  Card,
  ColorBadge,
  CopyButton,
  Dash,
  Empty,
  ErrorState,
  Fields,
  NetBoxButton,
  PageHeader,
  RefLink,
  Spinner,
  StatusBadge,
  Tags,
} from '../components/ui';
import type { Asset, Device, Interface, IPAddress, Service } from '../types';
import { choice, downloadCsv, percent, speed, today } from '../utils';
import { ASSETS, Warranty } from './Assets';
import { SERVICES, useServiceColors } from './Services';

function ServiceChip({ service, color }: { service: Service; color?: string }) {
  return (
    <span className="badge-row">
      <Link to={`/services/${service.id}`} className="mono">
        {service.service_id}
      </Link>
      {service.level && <ColorBadge label={service.level.display} color={color} />}
    </span>
  );
}

const connectedTo = (i: Interface) => {
  const peer = i.connected_endpoints?.[0] ?? i.link_peers?.[0];
  if (!peer) return '';
  return peer.device ? `${peer.device.display} ${peer.display}` : peer.display;
};

export function DeviceDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const highlight = Number(params.get('interface')) || null;
  const [filter, setFilter] = useState('');
  const colors = useServiceColors();

  const device = useQuery({ queryKey: ['device', id], queryFn: () => api<Device>(`dcim/devices/${id}/`) });
  const interfaces = useQuery({
    queryKey: ['device-interfaces', id],
    queryFn: () => fetchAll<Interface>('dcim/interfaces/', { device_id: id }),
  });
  const ips = useQuery({
    queryKey: ['device-ips', id],
    queryFn: () => fetchAll<IPAddress>('ipam/ip-addresses/', { device_id: id }),
  });
  const services = useQuery({
    queryKey: ['device-services', id],
    queryFn: () => fetchAll<Service>(SERVICES, { device_id: id }),
  });
  const assets = useQuery({
    queryKey: ['device-asset', id],
    queryFn: () => fetchAll<Asset>(ASSETS, { device_id: id }),
  });

  // Scroll to the interface the page was opened for (from search or a service)
  useEffect(() => {
    if (highlight && interfaces.data) document.getElementById(`if-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight, interfaces.data]);

  const ipsByInterface = useMemo(() => {
    const map = new Map<number, IPAddress[]>();
    for (const ip of ips.data ?? []) {
      if (ip.assigned_object_type !== 'dcim.interface' || !ip.assigned_object_id) continue;
      map.set(ip.assigned_object_id, [...(map.get(ip.assigned_object_id) ?? []), ip]);
    }
    return map;
  }, [ips.data]);
  const serviceByInterface = useMemo(
    () => new Map((services.data ?? []).filter((s) => s.interface).map((s) => [s.interface!.id, s])),
    [services.data],
  );
  const ownService = services.data?.find((s) => s.device?.id === Number(id));

  const ipText = (i: Interface) => (ipsByInterface.get(i.id) ?? []).map((ip) => ip.address).join(', ');
  const columns: Column<Interface>[] = [
    {
      key: 'name',
      header: 'Interface',
      render: (i) => (
        <span id={`if-${i.id}`}>
          <strong>{i.name}</strong>
          {i.label && <span className="muted"> {i.label}</span>}
        </span>
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
    { key: 'ip', header: 'IP addresses', render: (i) => <span className="mono">{ipText(i)}</span>, csv: ipText },
    { key: 'peer', header: 'Connected to', render: connectedTo, csv: connectedTo, className: 'hide-mobile' },
    {
      key: 'vlan',
      header: 'VLAN',
      render: (i) => i.untagged_vlan?.display ?? '',
      csv: (i) => i.untagged_vlan?.display,
      className: 'hide-mobile',
    },
    {
      key: 'service',
      header: 'Service',
      render: (i) => {
        const s = serviceByInterface.get(i.id);
        return s ? <ServiceChip service={s} color={colors.level(s.level?.id)} /> : <Dash />;
      },
      csv: (i) => serviceByInterface.get(i.id)?.service_id,
    },
    { key: 'level', header: 'Service level', render: () => null, csv: (i) => serviceByInterface.get(i.id)?.level?.display, className: 'hidden' },
  ];

  if (device.error) return <ErrorState error={device.error} />;
  if (!device.data) return <Spinner />;
  const d = device.data;
  const asset = assets.data?.[0];
  const rows = (interfaces.data ?? []).filter((i) => {
    const f = filter.toLowerCase();
    return !f || [i.name, i.label, i.description, ipText(i), connectedTo(i)].some((v) => v?.toLowerCase().includes(f));
  });

  return (
    <>
      <PageHeader
        title={d.display}
        subtitle={
          <>
            <Link to={`/sites/${d.site.id}`}>{d.site.display}</Link> · {d.role.display} · {d.device_type.manufacturer.display}{' '}
            {d.device_type.model}
          </>
        }
        badges={<StatusBadge status={d.status} />}
        actions={<NetBoxButton url={d.display_url} />}
      />
      <div className="grid-3">
        <Card title="Device">
          <Fields
            rows={[
              ['Site', <RefLink obj={d.site} to={`/sites/${d.site.id}`} />],
              ['Location', <RefLink obj={d.location} />],
              ['Rack', d.rack && `${d.rack.display}${d.position ? ` · U${d.position}` : ''}`],
              ['Role', d.role.display],
              ['Device type', `${d.device_type.manufacturer.display} ${d.device_type.model}`],
              ['Platform', <RefLink obj={d.platform} />],
              ['Tenant', <RefLink obj={d.tenant} />],
              ['Description', d.description],
              ['Tags', <Tags tags={d.tags} />],
            ]}
          />
        </Card>
        <Card title="Identification">
          <Fields
            rows={[
              ['Serial number', d.serial && <span className="mono with-copy">{d.serial} <CopyButton text={d.serial} /></span>],
              ['Asset tag', d.asset_tag && <span className="mono">{d.asset_tag}</span>],
              ['Primary IPv4', d.primary_ip4 && <span className="mono">{d.primary_ip4.display}</span>],
              ['Primary IPv6', d.primary_ip6 && <span className="mono">{d.primary_ip6.display}</span>],
              ['Out-of-band IP', d.oob_ip && <span className="mono">{d.oob_ip.display}</span>],
            ]}
          />
          <CustomFields cf={d.custom_fields} />
        </Card>
        <div className="stack">
          <Card title="Service on this device">
            {services.error ? (
              <ErrorState error={services.error} />
            ) : ownService ? (
              <Fields
                rows={[
                  ['Service', <ServiceChip service={ownService} color={colors.level(ownService.level?.id)} />],
                  ['Name', ownService.name],
                  ['Type', ownService.type.display],
                  ['Status', <StatusBadge status={ownService.status} />],
                  ['Availability', percent(ownService.effective_availability)],
                  ['Speed', [speed(ownService.download_speed), speed(ownService.upload_speed)].filter(Boolean).join(' / ')],
                ]}
              />
            ) : (
              <Empty>
                {services.data ? `None of its own${serviceByInterface.size ? `; ${serviceByInterface.size} on its interfaces` : ''}.` : 'Loading…'}
              </Empty>
            )}
          </Card>
          {asset && (
            <Card title="Asset" actions={<Link className="btn small" to={`/assets/${asset.id}`}>Asset details</Link>}>
              <Fields
                rows={[
                  ['Asset', asset.display],
                  ['Status', <StatusBadge status={asset.status} />],
                  ['Serial number', asset.serial],
                  ['Asset tag', asset.asset_tag],
                  ['Owner', <RefLink obj={asset.owning_tenant} />],
                  ['Warranty until', <Warranty end={asset.warranty_end} />],
                ]}
              />
              <CustomFields cf={asset.custom_fields} />
            </Card>
          )}
        </div>
      </div>

      <Card
        title={`Interfaces${interfaces.data ? ` (${interfaces.data.length})` : ''}`}
        flush
        actions={
          <>
            <div className="input-icon small">
              <Search size={14} />
              <input type="search" placeholder="Filter interfaces…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            {rows.length > 0 && (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  downloadCsv(
                    `interfaces-${d.name ?? d.id}-${today()}.csv`,
                    columns.filter((c) => c.csv).map((c) => ({ header: c.header, value: c.csv! })),
                    rows,
                  ).catch((e) => alert(`Export failed: ${e}`))
                }
              >
                Export CSV
              </button>
            )}
          </>
        }
      >
        {interfaces.error ? (
          <ErrorState error={interfaces.error} />
        ) : !interfaces.data ? (
          <Spinner />
        ) : rows.length ? (
          <DataTable columns={columns} rows={rows} rowClass={(i) => (i.id === highlight ? 'highlight' : undefined)} />
        ) : (
          <Empty>{filter ? 'No matching interfaces.' : 'No interfaces.'}</Empty>
        )}
      </Card>
      {highlight && (
        <p className="muted small">
          Highlighted: the interface you came for.{' '}
          <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>
            Remove highlight
          </button>
        </p>
      )}
    </>
  );
}
