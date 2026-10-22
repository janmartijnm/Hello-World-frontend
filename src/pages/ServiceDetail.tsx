import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { api, fetchAll, netboxLink } from '../api';
import { CustomFields } from '../components/CustomFields';
import { Card, ColorBadge, Dash, ErrorState, Fields, NetBoxButton, PageHeader, RefLink, Spinner, StatusBadge, Tags } from '../components/ui';
import type { Ref, Service } from '../types';
import { date, minutes, percent, speed } from '../utils';
import { SERVICES, serviceDevice, useServiceColors } from './Services';

// Other objects a service can be delivered by: API list and label
const RELATED: [keyof Service, string, string][] = [
  ['virtual_machines', 'virtualization/virtual-machines/', 'Virtual machines'],
  ['circuits', 'circuits/circuits/', 'Circuits'],
  ['prefixes', 'ipam/prefixes/', 'Prefixes'],
  ['vlans', 'ipam/vlans/', 'VLANs'],
  ['vrfs', 'ipam/vrfs/', 'VRFs'],
  ['l2vpns', 'vpn/l2vpns/', 'L2VPNs'],
];

function RelatedList({ path, ids }: { path: string; ids: number[] }) {
  const q = useQuery({
    queryKey: ['related', path, ids],
    queryFn: () => fetchAll<Ref>(path, { id: ids, brief: true }),
    enabled: ids.length > 0,
  });
  if (!ids.length) return <Dash />;
  if (q.error) return <span className="muted">{ids.length} (no permission to view)</span>;
  if (!q.data) return <span className="muted">…</span>;
  return (
    <span className="list-inline">
      {q.data.map((o) => (
        <a key={o.id} href={netboxLink(o.display_url ?? o.url)} target="_blank" rel="noreferrer">
          {o.display}
        </a>
      ))}
    </span>
  );
}

export function ServiceDetail() {
  const { id } = useParams();
  const colors = useServiceColors();
  const service = useQuery({ queryKey: ['service', id], queryFn: () => api<Service>(`${SERVICES}${id}/`) });

  if (service.error) return <ErrorState error={service.error} />;
  if (!service.data) return <Spinner />;
  const s = service.data;
  const level = colors.levels.find((l) => l.id === s.level?.id);
  const device = serviceDevice(s);

  return (
    <>
      <PageHeader
        title={<span className="mono">{s.service_id}</span>}
        subtitle={s.name}
        badges={
          <>
            <StatusBadge status={s.status} />
            <ColorBadge label={s.type.display} color={colors.type(s.type.id)} />
          </>
        }
        actions={<NetBoxButton url={s.display_url} />}
      />
      <div className="grid-3">
        <Card title="Service">
          <Fields
            rows={[
              ['Service ID', <span className="mono">{s.service_id}</span>],
              ['Name', s.name],
              ['Type', <ColorBadge label={s.type.display} color={colors.type(s.type.id)} />],
              ['Status', <StatusBadge status={s.status} />],
              ['Tenant', <RefLink obj={s.tenant} />],
              ['Description', s.description],
              ['Tags', <Tags tags={s.tags} />],
            ]}
          />
          <CustomFields cf={s.custom_fields} />
        </Card>
        <Card title="Service level">
          <Fields
            rows={[
              ['Service level', s.level ? <ColorBadge label={s.level.display} color={level?.color} /> : null],
              [
                'Availability',
                s.effective_availability && (
                  <>
                    {percent(s.effective_availability)}
                    {s.availability === null && s.level && <span className="muted"> (from the service level)</span>}
                  </>
                ),
              ],
              ['Response time', minutes(level?.response_time)],
              ['Restore time', minutes(level?.restore_time)],
              ['Support hours', level?.support_hours],
              ['Download speed', speed(s.download_speed)],
              ['Upload speed', speed(s.upload_speed)],
            ]}
          />
        </Card>
        <Card title="Dates">
          <Fields
            rows={[
              ['Ordered', date(s.order_date)],
              ['Activated', date(s.activation_date)],
              ['Contract start', date(s.contract_start)],
              ['Contract end', date(s.contract_end)],
              ['Decommissioned', date(s.decommission_date)],
            ]}
          />
        </Card>
      </div>
      <Card title="Delivered by">
        <Fields
          rows={[
            ['Device', device && <Link to={`/devices/${device.id}`}>{device.display}</Link>],
            [
              'Interface',
              s.interface && <Link to={`/devices/${s.interface.device.id}?interface=${s.interface.id}`}>{s.interface.display}</Link>,
            ],
            ...RELATED.map(([field, path, label]) => [label, <RelatedList path={path} ids={s[field] as number[]} />] as [string, ReactNode]),
          ]}
        />
      </Card>
    </>
  );
}
