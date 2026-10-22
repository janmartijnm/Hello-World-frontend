import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { api } from '../api';
import { CustomFields } from '../components/CustomFields';
import { Card, CopyButton, ErrorState, Fields, NetBoxButton, PageHeader, RefLink, Spinner, StatusBadge, Tags } from '../components/ui';
import type { Asset, Device } from '../types';
import { choice, date } from '../utils';
import { ASSETS, AssignedTo, assetType, Warranty } from './Assets';

export function AssetDetail() {
  const { id } = useParams();
  const asset = useQuery({ queryKey: ['asset', id], queryFn: () => api<Asset>(`${ASSETS}${id}/`) });
  // Where an assigned device is: its site
  const deviceId = asset.data?.device?.id ?? asset.data?.module?.device?.id ?? asset.data?.inventoryitem?.device?.id;
  const device = useQuery({
    queryKey: ['device', String(deviceId)],
    queryFn: () => api<Device>(`dcim/devices/${deviceId}/`),
    enabled: Boolean(deviceId),
  });

  if (asset.error) return <ErrorState error={asset.error} />;
  if (!asset.data) return <Spinner />;
  const a = asset.data;
  const kind = choice(a.kind)?.label;

  return (
    <>
      <PageHeader
        title={a.display}
        subtitle={[kind, assetType(a)].filter(Boolean).join(' · ')}
        badges={<StatusBadge status={a.status} />}
        actions={<NetBoxButton url={a.display_url ?? a.url} />}
      />
      <div className="grid-3">
        <Card title="Asset">
          <Fields
            rows={[
              ['Name', a.name],
              ['Role', <RefLink obj={a.role} />],
              ['Kind', kind],
              ['Type', assetType(a)],
              ['Serial number', a.serial && <span className="mono with-copy">{a.serial} <CopyButton text={a.serial} /></span>],
              ['Asset tag', a.asset_tag && <span className="mono">{a.asset_tag}</span>],
              ['Status', <StatusBadge status={a.status} />],
              ['Description', a.description],
              ['Tags', <Tags tags={a.tags} />],
            ]}
          />
          <CustomFields cf={a.custom_fields} />
        </Card>
        <Card title="Location">
          <Fields
            rows={[
              ['Assigned to', <AssignedTo asset={a} />],
              ['On device', a.module?.device ?? a.inventoryitem?.device ? <RefLink obj={a.module?.device ?? a.inventoryitem?.device} to={`/devices/${deviceId}`} /> : undefined],
              ['Site', device.data && <Link to={`/sites/${device.data.site.id}`}>{device.data.site.display}</Link>],
              ['Storage location', <RefLink obj={a.storage_location} />],
            ]}
          />
        </Card>
        <Card title="Purchase and warranty">
          <Fields
            rows={[
              ['Purchase', <RefLink obj={a.purchase} />],
              ['Supplier', <RefLink obj={a.purchase?.supplier} />],
              ['Delivery', <RefLink obj={a.delivery} />],
              ['Warranty start', date(a.warranty_start)],
              ['Warranty end', <Warranty end={a.warranty_end} />],
              ['Tenant', <RefLink obj={a.tenant} />],
              ['Owner', <RefLink obj={a.owning_tenant} />],
            ]}
          />
        </Card>
      </div>
      {a.comments && (
        <Card title="Comments">
          <p className="pre" style={{ margin: 0 }}>
            {a.comments}
          </p>
        </Card>
      )}
    </>
  );
}
