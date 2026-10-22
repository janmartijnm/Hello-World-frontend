import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ExternalLink, Search } from 'lucide-react';

import { netboxLink } from '../api';
import { Card, Empty, PageHeader, Spinner } from '../components/ui';
import { useSearch } from '../search';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const { groups, loading, tooShort } = useSearch(q, 25);

  return (
    <>
      <PageHeader title="Search" />
      <form
        className="filterbar"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q: text.trim() });
        }}
      >
        <div className="input-icon grow">
          <Search size={16} />
          <input type="search" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search everything…" />
        </div>
        <button className="btn primary" type="submit">
          Search
        </button>
      </form>
      {tooShort && <Empty>Type at least 2 characters.</Empty>}
      {!tooShort && loading && !groups.length && <Spinner label="Searching…" />}
      {!tooShort && !loading && !groups.length && <Empty>No results for “{q}”.</Empty>}
      {groups.map((g) => (
        <Card
          key={g.source.key}
          title={`${g.source.label} (${g.count})`}
          flush
          actions={
            g.count > g.hits.length && (
              <a className="btn ghost small" href={netboxLink(`/${g.source.path}?q=${encodeURIComponent(q)}`)} target="_blank" rel="noreferrer">
                All {g.count} in NetBox <ExternalLink size={14} />
              </a>
            )
          }
        >
          <ul className="hits">
            {g.hits.map((hit) => (
              <li key={hit.obj.id}>
                {hit.to ? (
                  <Link to={hit.to}>{hit.obj.display}</Link>
                ) : (
                  <a href={hit.href} target="_blank" rel="noreferrer">
                    {hit.obj.display} <ExternalLink size={12} />
                  </a>
                )}
                <span className="muted">{g.source.detail(hit.obj)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
