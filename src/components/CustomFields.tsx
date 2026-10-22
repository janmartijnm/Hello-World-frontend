import type { ReactNode } from 'react';

import { CopyButton, Fields } from './ui';

function show(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) return value.map((v) => show(v)).join(', ');
  if (typeof value === 'object') return (value as { display?: string }).display ?? JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** An object's custom fields that have a value; a UUID gets a copy button. */
export function customFieldRows(cf: Record<string, unknown> | undefined): [string, ReactNode][] {
  return Object.entries(cf ?? {})
    .filter(([, v]) => show(v) !== undefined)
    .sort(([a], [b]) => (a === 'UUID' ? -1 : b === 'UUID' ? 1 : a.localeCompare(b)))
    .map(([name, v]) => {
      const text = show(v);
      const label = name.replace(/_/g, ' ');
      if (name.toLowerCase() === 'uuid') {
        return [
          label,
          <span className="mono with-copy" key={name}>
            {text} <CopyButton text={String(text)} title="Copy UUID" />
          </span>,
        ];
      }
      return [label.charAt(0).toUpperCase() + label.slice(1), text];
    });
}

export function CustomFields({ cf }: { cf: Record<string, unknown> | undefined }) {
  const rows = customFieldRows(cf);
  return rows.length ? <Fields rows={rows} /> : null;
}
