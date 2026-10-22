import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react';

import { api, fetchAll, type Page, type Params } from '../api';
import type { Ref } from '../types';
import { downloadCsv, today, type CsvColumn } from '../utils';
import { Empty, ErrorState, Spinner } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value in the CSV export; columns without one are left out of it. */
  csv?: (row: T) => string | number | null | undefined;
  /** API ordering field, to sort on this column. */
  sort?: string;
  className?: string;
}

export interface FilterDef {
  /** API filter parameter, e.g. "region_id". It is also the name in the page URL. */
  name: string;
  label: string;
  /** Fixed choices ... */
  options?: { value: string; label: string }[];
  /** ... or the objects of this API list, e.g. "dcim/regions/". */
  source?: string;
}

const PAGE_SIZES = [25, 50, 100, 250];

/** List state (search, filters, page, sort) kept in the URL, so it can be shared and Back works. */
export function useListState(filters: FilterDef[]) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const per = PAGE_SIZES.includes(Number(params.get('per'))) ? Number(params.get('per')) : 50;
  const sort = params.get('sort') || '';
  const q = params.get('q') || '';

  const apiFilters = useMemo(() => {
    const out: Params = { q: q || undefined };
    for (const f of filters) out[f.name] = params.get(f.name) || undefined;
    return out;
  }, [params, filters, q]);

  const set = (changes: Record<string, string | number | null>, resetPage = true) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (resetPage && !('page' in changes)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  return { params, page, per, sort, q, apiFilters, set };
}

export type ListState = ReturnType<typeof useListState>;

function useOptions(source?: string) {
  return useQuery({
    queryKey: ['options', source],
    queryFn: () => fetchAll<Ref>(source!, { brief: true, ordering: 'name' }),
    enabled: Boolean(source),
    staleTime: 5 * 60_000,
  });
}

function FilterSelect({ def, state }: { def: FilterDef; state: ListState }) {
  const { data, isError } = useOptions(def.source);
  const options = def.options ?? (data ?? []).map((o) => ({ value: String(o.id), label: o.display }));
  if (def.source && isError) return null; // no permission to list these: no filter
  return (
    <label className="filter">
      <span>{def.label}</span>
      <select value={state.params.get(def.name) || ''} onChange={(e) => state.set({ [def.name]: e.target.value })}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({
  filters,
  state,
  placeholder = 'Search…',
  children,
}: {
  filters: FilterDef[];
  state: ListState;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [text, setText] = useState(state.q);
  useEffect(() => setText(state.q), [state.q]);
  // Search while typing, after a short pause
  useEffect(() => {
    if (text === state.q) return;
    const t = setTimeout(() => state.set({ q: text }), 300);
    return () => clearTimeout(t);
  }, [text]); // state.q/state.set deliberately left out: only typing triggers a search

  const active = filters.some((f) => state.params.get(f.name)) || state.q;
  return (
    <div className="filterbar">
      <label className="filter grow">
        <span>Search</span>
        <div className="input-icon">
          <Search size={16} />
          <input type="search" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        </div>
      </label>
      {filters.map((f) => (
        <FilterSelect key={f.name} def={f} state={state} />
      ))}
      {active && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setText('');
            state.set(Object.fromEntries([['q', null], ...filters.map((f) => [f.name, null])]));
          }}
        >
          <X size={16} /> Clear
        </button>
      )}
      {children && <div className="filterbar-extra">{children}</div>}
    </div>
  );
}

export function usePage<T>(path: string, state: ListState, base?: Params) {
  const params: Params = {
    ...base,
    ...state.apiFilters,
    limit: state.per,
    offset: (state.page - 1) * state.per,
    ordering: state.sort || undefined,
  };
  return useQuery({
    queryKey: ['list', path, params],
    queryFn: () => api<Page<T>>(path, params),
    placeholderData: keepPreviousData,
  });
}

export function DataTable<T extends { id: number }>({
  columns,
  rows,
  state,
  rowLink,
  rowClass,
}: {
  columns: Column<T>[];
  rows: T[];
  state?: ListState;
  rowLink?: (row: T) => string;
  rowClass?: (row: T) => string | undefined;
}) {
  const navigate = useNavigate();
  // Columns marked "hidden" exist only for the CSV export
  columns = columns.filter((c) => c.className !== 'hidden');
  const sortBy = (col: Column<T>) => {
    if (!state || !col.sort) return;
    state.set({ sort: state.sort === col.sort ? `-${col.sort}` : col.sort });
  };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => {
              const dir = state?.sort === c.sort ? 'asc' : state?.sort === `-${c.sort}` ? 'desc' : null;
              return (
                <th key={c.key} className={c.className} aria-sort={dir ? `${dir}ending` : undefined}>
                  {c.sort && state ? (
                    <button type="button" className="th-sort" onClick={() => sortBy(c)}>
                      {c.header}
                      {dir === 'asc' && <ArrowUp size={14} />}
                      {dir === 'desc' && <ArrowDown size={14} />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={[rowLink && 'clickable', rowClass?.(row)].filter(Boolean).join(' ') || undefined}
              onClick={(e) => {
                // Whole row opens the object, except when clicking a link or button inside it
                if (!rowLink || (e.target as HTMLElement).closest('a,button')) return;
                navigate(rowLink(row));
              }}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ state, count }: { state: ListState; count: number }) {
  const pages = Math.max(1, Math.ceil(count / state.per));
  const from = count ? (state.page - 1) * state.per + 1 : 0;
  const to = Math.min(count, state.page * state.per);
  return (
    <div className="pagination">
      <span className="muted">
        {from}–{to} of {count}
      </span>
      <label className="per-page">
        <select value={state.per} onChange={(e) => state.set({ per: e.target.value })} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </label>
      <div className="pager">
        <button
          type="button"
          className="icon-btn"
          disabled={state.page <= 1}
          onClick={() => state.set({ page: state.page - 1 }, false)}
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {state.page} / {pages}
        </span>
        <button
          type="button"
          className="icon-btn"
          disabled={state.page >= pages}
          onClick={() => state.set({ page: state.page + 1 }, false)}
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

/** Downloads every row matching the current filters (not only this page) as CSV. */
export function ExportButton<T>({
  path,
  params,
  columns,
  name,
}: {
  path: string;
  params: Params;
  columns: Column<T>[];
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const csvColumns: CsvColumn<T>[] = columns.filter((c) => c.csv).map((c) => ({ header: c.header, value: c.csv! }));
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
            const rows = await fetchAll<T>(path, params);
            await downloadCsv(`${name}-${today()}.csv`, csvColumns, rows);
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

/** A complete list: filters, table, paging and export, all driven by the URL. */
export function ListView<T extends { id: number }>({
  path,
  columns,
  filters,
  rowLink,
  exportName,
  placeholder,
  base,
}: {
  path: string;
  columns: Column<T>[];
  filters: FilterDef[];
  rowLink?: (row: T) => string;
  exportName: string;
  placeholder?: string;
  base?: Params;
}) {
  const state = useListState(filters);
  const { data, error, isPending, isFetching } = usePage<T>(path, state, base);
  return (
    <>
      <FilterBar filters={filters} state={state} placeholder={placeholder}>
        <ExportButton path={path} params={{ ...base, ...state.apiFilters, ordering: state.sort || undefined }} columns={columns} name={exportName} />
      </FilterBar>
      <ListBody data={data} error={error} isPending={isPending} isFetching={isFetching}>
        {(rows) => <DataTable columns={columns} rows={rows} state={state} rowLink={rowLink} />}
      </ListBody>
      {data && data.count > 0 && <Pagination state={state} count={data.count} />}
    </>
  );
}

export function ListBody<T>({
  data,
  error,
  isPending,
  isFetching,
  children,
}: {
  data?: Page<T>;
  error: unknown;
  isPending: boolean;
  isFetching?: boolean;
  children: (rows: T[]) => ReactNode;
}) {
  if (error) return <ErrorState error={error} />;
  if (isPending || !data) return <Spinner />;
  if (!data.results.length) return <Empty>No results. Try other filters.</Empty>;
  return <div className={isFetching ? 'loading-fade' : undefined}>{children(data.results)}</div>;
}
