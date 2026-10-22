import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

import { isTauri } from './api';

/** A speed in Kbps as "100 Mbps", "1 Gbps". */
export function speed(kbps: number | null | undefined): string {
  if (!kbps) return '';
  if (kbps >= 1_000_000 && kbps % 1_000_000 === 0) return `${kbps / 1_000_000} Gbps`;
  if (kbps >= 1_000) return `${+(kbps / 1_000).toFixed(1)} Mbps`;
  return `${kbps} Kbps`;
}

/** A number of minutes as "45m", "4h", "1d 2h". */
export function minutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const d = Math.floor(value / 1440);
  const h = Math.floor((value % 1440) / 60);
  const m = value % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
}

/** A date or timestamp as dd-mm-yyyy. */
export function date(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** The last line of an address, usually "postcode city". */
export function city(address: string | null | undefined): string {
  const lines = (address || '').split(/\r?\n|,/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || '';
}

/** "99.95 %" from a decimal string. */
export function percent(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `${+value} %`;
}

// Colors for NetBox's usual status values
const STATUS_TONES: Record<string, string> = {
  active: 'green',
  online: 'green',
  connected: 'green',
  planned: 'blue',
  staged: 'blue',
  staging: 'blue',
  provisioning: 'blue',
  ordered: 'blue',
  offline: 'gray',
  inventory: 'gray',
  reserved: 'purple',
  deprecated: 'orange',
  decommissioning: 'orange',
  suspended: 'red',
  deprovisioning: 'orange',
  decommissioned: 'gray',
  failed: 'red',
  used: 'blue',
  stored: 'green',
  retired: 'gray',
  deprecating: 'orange',
};

/** A choice as NetBox's {value, label}, also when an API gives just the value (e.g. "active"). */
export function choice(c: { value: string; label: string } | string | null | undefined) {
  if (!c) return null;
  if (typeof c === 'string') return { value: c, label: (c.charAt(0).toUpperCase() + c.slice(1)).replace(/[-_]/g, ' ') };
  return c;
}

export function statusTone(value: string | undefined): string {
  return STATUS_TONES[value || ''] || 'gray';
}

/** Black or white text for a background color like "ff9800". */
export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#111' : '#fff';
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * A CSV file for Excel: semicolon-separated with a UTF-8 BOM, which Excel with Dutch (and most European) settings
 * opens straight into columns, accents intact. In the app it is saved with the system's "Save as" dialog; returns
 * false when the user cancels.
 */
export async function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): Promise<boolean> {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(';')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(';'));
  const text = '\ufeff' + lines.join('\r\n');

  if (isTauri) {
    const path = await save({ defaultPath: filename, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
