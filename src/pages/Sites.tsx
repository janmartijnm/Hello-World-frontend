import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Table } from 'lucide-react';

import { fetchAll } from '../api';
import {
  DataTable,
  ExportButton,
  FilterBar,
  ListBody,
  Pagination,
  useListState,
  usePage,
  type Column,
  type FilterDef,
} from '../components/list';
import { SiteMap } from '../components/SiteMap';
import { ErrorState, PageHeader, RefLink, Spinner, StatusBadge } from '../components/ui';
import type { Site } from '../types';
import { choice, city } from '../utils';
import { MAP_FIELDS } from './Home';

export const SITE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'staging', label: 'Staging' },
  { value: 'decommissioning', label: 'Decommissioning' },
  { value: 'retired', label: 'Retired' },
];

const FILTERS: FilterDef[] = [
  { name: 'region_id', label: 'Region', source: 'dcim/regions/' },
  { name: 'group_id', label: 'Site group', source: 'dcim/site-groups/' },
  { name: 'status', label: 'Status', options: SITE_STATUSES },
];

export const SITE_COLUMNS: Column<Site>[] = [
  { key: 'name', header: 'Name', sort: 'name', render: (s) => <Link to={`/sites/${s.id}`}>{s.name}</Link>, csv: (s) => s.name },
  { key: 'facility', header: 'Facility', sort: 'facility', render: (s) => s.facility, csv: (s) => s.facility },
  { key: 'status', header: 'Status', sort: 'status', render: (s) => <StatusBadge status={s.status} />, csv: (s) => choice(s.status)?.label },
  { key: 'region', header: 'Region', sort: 'region', render: (s) => <RefLink obj={s.region} />, csv: (s) => s.region?.display },
  { key: 'group', header: 'Site group', sort: 'group', render: (s) => <RefLink obj={s.group} />, csv: (s) => s.group?.display },
  {
    key: 'city',
    header: 'Postcode / city',
    render: (s) => city(s.physical_address),
    csv: (s) => city(s.physical_address),
    className: 'hide-mobile',
  },
  {
    key: 'devices',
    header: 'Devices',
    render: (s) => s.device_count ?? '',
    csv: (s) => s.device_count,
    className: 'num',
  },
  { key: 'address', header: 'Address', render: () => null, csv: (s) => s.physical_address.replace(/\r?\n/g, ', '), className: 'hidden' },
  { key: 'latitude', header: 'Latitude', render: () => null, csv: (s) => s.latitude, className: 'hidden' },
  { key: 'longitude', header: 'Longitude', render: () => null, csv: (s) => s.longitude, className: 'hidden' },
  { key: 'uuid', header: 'UUID', render: () => null, csv: (s) => s.custom_fields?.UUID as string, className: 'hidden' },
];

export function Sites() {
  const state = useListState(FILTERS);
  const view = state.params.get('view') === 'map' ? 'map' : 'table';
  const page = usePage<Site>('dcim/sites/', state);
  const all = useQuery({
    queryKey: ['sites-map', state.apiFilters],
    queryFn: () => fetchAll<Site>('dcim/sites/', { ...state.apiFilters, fields: MAP_FIELDS }),
    enabled: view === 'map',
  });

  return (
    <>
      <PageHeader title="Sites" subtitle={page.data ? `${page.data.count} sites` : undefined} />
      <FilterBar filters={FILTERS} state={state} placeholder="Name, facility, address…">
        <div className="segmented" role="group" aria-label="View">
          <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => state.set({ view: null }, false)}>
            <Table size={16} /> Table
          </button>
          <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => state.set({ view: 'map' }, false)}>
            <MapIcon size={16} /> Map
          </button>
        </div>
        <ExportButton path="dcim/sites/" params={{ ...state.apiFilters, ordering: state.sort || undefined }} columns={SITE_COLUMNS} name="sites" />
      </FilterBar>
      {view === 'map' ? (
        all.error ? (
          <ErrorState error={all.error} />
        ) : all.data ? (
          <div className="card">
            <SiteMap sites={all.data} height={600} />
          </div>
        ) : (
          <Spinner />
        )
      ) : (
        <>
          <ListBody data={page.data} error={page.error} isPending={page.isPending} isFetching={page.isFetching}>
            {(rows) => <DataTable columns={SITE_COLUMNS} rows={rows} state={state} rowLink={(s) => `/sites/${s.id}`} />}
          </ListBody>
          {page.data && page.data.count > 0 && <Pagination state={state} count={page.data.count} />}
        </>
      )}
    </>
  );
}
