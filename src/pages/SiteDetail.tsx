import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { MapPinned } from 'lucide-react';

import { api, fetchAll } from '../api';
import { CustomFields } from '../components/CustomFields';
import { DataTable, ExportButton } from '../components/list';
import { SiteMap } from '../components/SiteMap';
import {
  Card,
  CopyButton,
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
import type { Device, Service, Site } from '../types';
import { DEVICE_COLUMNS } from './Devices';
import { SERVICES, useServiceColumns } from './Services';

/** The services on these devices or on their interfaces. */
async function servicesOnDevices(ids: number[]): Promise<Service[]> {
  const out: Service[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    out.push(...(await fetchAll<Service>(SERVICES, { device_id: ids.slice(i, i + 50) })));
  }
  return out;
}

export function SiteDetail() {
  const { id } = useParams();
  const site = useQuery({ queryKey: ['site', id], queryFn: () => api<Site>(`dcim/sites/${id}/`) });
  const devices = useQuery({
    queryKey: ['site-devices', id],
    queryFn: () => fetchAll<Device>('dcim/devices/', { site_id: id, ordering: 'name' }),
  });
  const services = useQuery({
    queryKey: ['site-services', id, devices.data?.length],
    queryFn: () => servicesOnDevices(devices.data!.map((d) => d.id)),
    enabled: Boolean(devices.data?.length),
  });
  const serviceColumns = useServiceColumns();

  if (site.error) return <ErrorState error={site.error} />;
  if (!site.data) return <Spinner />;
  const s = site.data;
  const hasLocation = s.latitude !== null && s.longitude !== null;

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={[s.facility && `Facility ${s.facility}`, s.region?.display, s.group?.display].filter(Boolean).join(' · ')}
        badges={<StatusBadge status={s.status} />}
        actions={<NetBoxButton url={s.display_url} />}
      />
      <div className="grid-2">
        <Card title="Details">
          <Fields
            rows={[
              ['Facility', s.facility],
              ['Region', <RefLink obj={s.region} />],
              ['Site group', <RefLink obj={s.group} />],
              ['Tenant', <RefLink obj={s.tenant} />],
              ['Time zone', s.time_zone],
              ['Description', s.description],
              ['Tags', <Tags tags={s.tags} />],
            ]}
          />
          <CustomFields cf={s.custom_fields} />
        </Card>
        <Card
          title="Address"
          actions={
            hasLocation && (
              <a
                className="btn ghost small"
                href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=17/${s.latitude}/${s.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPinned size={16} /> Route / map
              </a>
            )
          }
        >
          <Fields
            rows={[
              [
                'Physical address',
                s.physical_address && (
                  <span className="with-copy">
                    <span className="pre">{s.physical_address}</span>
                    <CopyButton text={s.physical_address} title="Copy address" />
                  </span>
                ),
              ],
              ['Shipping address', s.shipping_address && <span className="pre">{s.shipping_address}</span>],
              ['Coordinates', hasLocation && <span className="mono">{`${s.latitude}, ${s.longitude}`}</span>],
            ]}
          />
          {hasLocation && <SiteMap sites={[s]} height={220} single />}
        </Card>
      </div>

      <Card
        title={`Devices${devices.data ? ` (${devices.data.length})` : ''}`}
        flush
        actions={
          devices.data?.length ? (
            <ExportButton path="dcim/devices/" params={{ site_id: s.id, ordering: 'name' }} columns={DEVICE_COLUMNS} name={`devices-${s.slug}`} />
          ) : null
        }
      >
        {devices.error ? (
          <ErrorState error={devices.error} />
        ) : !devices.data ? (
          <Spinner />
        ) : devices.data.length ? (
          <DataTable columns={DEVICE_COLUMNS.filter((c) => c.key !== 'site')} rows={devices.data} rowLink={(d) => `/devices/${d.id}`} />
        ) : (
          <Empty>No devices at this site.</Empty>
        )}
      </Card>

      <Card title={`Services${services.data ? ` (${services.data.length})` : ''}`} flush>
        {devices.data?.length === 0 ? (
          <Empty>No services: there are no devices at this site.</Empty>
        ) : devices.error || services.error ? (
          <ErrorState error={services.error ?? devices.error} />
        ) : !services.data ? (
          <Spinner />
        ) : services.data.length ? (
          <DataTable columns={serviceColumns} rows={services.data} rowLink={(x) => `/services/${x.id}`} />
        ) : (
          <Empty>No services on the devices of this site.</Empty>
        )}
      </Card>
    </>
  );
}
