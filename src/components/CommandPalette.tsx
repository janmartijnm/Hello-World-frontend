import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, ExternalLink, Search } from 'lucide-react';

import { useSearch, type Hit } from '../search';

/** The Ctrl+K search window: type, pick a result with the arrow keys, Enter opens it. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const { groups, loading, tooShort } = useSearch(debounced, 5);
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  useEffect(() => setActive(0), [debounced]);

  if (!open) return null;

  const openHit = (hit: Hit) => {
    onClose();
    if (hit.to) navigate(hit.to);
    else window.open(hit.href, '_blank', 'noreferrer');
  };
  const seeAll = () => {
    onClose();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={input}
            value={q}
            placeholder="Search sites, devices, interfaces, IPs, services…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                if (hits[active]) openHit(hits[active]);
                else if (q.trim().length >= 2) seeAll();
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results">
          {tooShort && <p className="muted pad">Type at least 2 characters.</p>}
          {!tooShort && !loading && !hits.length && <p className="muted pad">No results for “{debounced}”.</p>}
          {groups.map((g) => (
            <div key={g.source.key}>
              <div className="palette-group">
                {g.source.label} <span className="muted">{g.count}</span>
              </div>
              {g.hits.map((hit) => {
                const index = hits.indexOf(hit);
                return (
                  <button
                    type="button"
                    key={hit.obj.id}
                    className={index === active ? 'palette-hit active' : 'palette-hit'}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => openHit(hit)}
                  >
                    <span className="hit-title">{hit.obj.display}</span>
                    <span className="hit-detail">{g.source.detail(hit.obj)}</span>
                    {hit.to ? <ArrowRight size={14} /> : <ExternalLink size={14} />}
                  </button>
                );
              })}
            </div>
          ))}
          {loading && <p className="muted pad">Searching…</p>}
        </div>
        {!tooShort && (
          <button type="button" className="palette-all" onClick={seeAll}>
            See all results for “{q.trim()}”
          </button>
        )}
      </div>
    </div>
  );
}
