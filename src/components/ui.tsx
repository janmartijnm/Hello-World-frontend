import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, Copy, ExternalLink, Lock, SearchX, TriangleAlert } from 'lucide-react';

import { ApiError, netboxLink } from '../api';
import type { Choice, Ref, Tag } from '../types';
import { choice, statusTone, textOn } from '../utils';

export function StatusBadge({ status }: { status: Choice | null | undefined }) {
  const c = choice(status);
  if (!c) return null;
  return <span className={`badge tone-${statusTone(c.value)}`}>{c.label}</span>;
}

export function ColorBadge({ label, color }: { label: ReactNode; color?: string | null }) {
  if (!color) return <span className="badge tone-gray">{label}</span>;
  return (
    <span className="badge" style={{ background: `#${color}`, color: textOn(color) }}>
      {label}
    </span>
  );
}

export function Tags({ tags }: { tags?: Tag[] }) {
  if (!tags?.length) return <Dash />;
  return (
    <span className="badge-row">
      {tags.map((t) => (
        <ColorBadge key={t.id} label={t.display} color={t.color} />
      ))}
    </span>
  );
}

export function Dash() {
  return <span className="muted">—</span>;
}

/** A value, or a dash when empty. */
export function Val({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' || children === false ? <Dash /> : <>{children}</>;
}

/** A related object: a link inside the explorer when it has a page here, else plain text. */
export function RefLink({ obj, to }: { obj: Ref | null | undefined; to?: string }) {
  if (!obj) return <Dash />;
  return to ? <Link to={to}>{obj.display}</Link> : <>{obj.display}</>;
}

export function NetBoxButton({ url, label = 'Open in NetBox' }: { url?: string | null; label?: string }) {
  return (
    <a className="btn" href={netboxLink(url)} target="_blank" rel="noreferrer">
      <ExternalLink size={16} /> {label}
    </a>
  );
}

export function CopyButton({ text, title = 'Copy' }: { text: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title={title}
      aria-label={title}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  flush,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2>{title}</h2>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

/** Label/value rows; rows with an undefined value are left out. */
export function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="fields">
      {rows
        .filter(([, v]) => v !== undefined)
        .map(([label, value]) => (
          <div key={label} className="field">
            <dt>{label}</dt>
            <dd>
              <Val>{value}</Val>
            </dd>
          </div>
        ))}
    </dl>
  );
}

export function PageHeader({
  title,
  subtitle,
  badges,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>
          {title} {badges && <span className="badge-row">{badges}</span>}
        </h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" /> {label}
    </div>
  );
}

/** What to show instead of data that couldn't be loaded. */
export function ErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.forbidden) {
    return (
      <div className="state">
        <Lock size={18} /> You don't have permission to see this in NetBox.
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="state">
        <SearchX size={18} /> Not found.
      </div>
    );
  }
  return (
    <div className="state error">
      <TriangleAlert size={18} /> Couldn't load this: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Empty({ children = 'Nothing here.' }: { children?: ReactNode }) {
  return <div className="state">{children}</div>;
}
