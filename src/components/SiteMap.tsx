import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { config } from '../api';
import type { Site } from '../types';
import { choice, city } from '../utils';

// One color per site group, in order of first appearance (colorblind-friendly palette)
const PALETTE = ['#2f6fde', '#e8743b', '#19a979', '#d64e9a', '#945ecf', '#13a4b4', '#bf9d00', '#6f7d8c'];
const NETHERLANDS: LatLngExpression = [52.2, 5.3];
// Site statuses in their lifecycle order, each with its own color; other (custom) statuses get one from PALETTE
const STATUS_COLORS: [string, string][] = [
  ['planned', '#2f6fde'],
  ['staging', '#13a4b4'],
  ['active', '#19a979'],
  ['decommissioning', '#e8743b'],
  ['retired', '#8a96a3'],
];

export type ColorBy = 'group' | 'status';

/** What a site is colored by: its site group or its status ({key, label}) */
function category(s: Pick<Site, 'group' | 'status'>, by: ColorBy) {
  if (by === 'group') {
    const label = s.group?.display ?? 'No group';
    return { key: label, label };
  }
  const status = choice(s.status);
  return { key: status?.value ?? '', label: status?.label ?? 'No status' };
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
  }, [map, points]);
  return null;
}

/** Legend: color per category (key -> {label, color}), statuses in lifecycle order, groups in order of appearance */
export function categoryColors(sites: Pick<Site, 'group' | 'status'>[], by: ColorBy = 'group') {
  const colors = new Map<string, { label: string; color: string }>();
  const present = new Map(sites.map((s) => [category(s, by).key, category(s, by).label]));
  if (by === 'status') {
    for (const [value, color] of STATUS_COLORS) {
      if (present.has(value)) colors.set(value, { label: present.get(value)!, color });
    }
  }
  let next = 0;
  for (const [key, label] of present) {
    if (!colors.has(key)) colors.set(key, { label, color: PALETTE[(by === 'status' ? 4 + next++ : colors.size) % PALETTE.length] });
  }
  return colors;
}

export function SiteMap({
  sites,
  height = 420,
  single = false,
  colorBy = 'group',
}: {
  sites: Site[];
  height?: number;
  single?: boolean;
  /** Color the sites by site group (default) or by status */
  colorBy?: ColorBy;
}) {
  const located = useMemo(() => sites.filter((s) => s.latitude !== null && s.longitude !== null), [sites]);
  const points = useMemo(() => located.map((s) => [Number(s.latitude), Number(s.longitude)] as [number, number]), [located]);
  const colors = useMemo(() => categoryColors(located, colorBy), [located, colorBy]);
  const missing = sites.length - located.length;

  return (
    <div className="map-wrap">
      <MapContainer center={NETHERLANDS} zoom={7} style={{ height }} scrollWheelZoom={!single}>
        <TileLayer url={config.mapTiles} attribution={config.mapAttribution} />
        <FitBounds points={points} />
        {located.map((s) => {
          const color = colors.get(category(s, colorBy).key)!.color;
          return (
            <CircleMarker
              key={s.id}
              center={[Number(s.latitude), Number(s.longitude)]}
              radius={single ? 10 : 8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }}
            >
              {!single && (
                <Popup>
                  <strong>
                    <Link to={`/sites/${s.id}`}>{s.name}</Link>
                  </strong>
                  <br />
                  {[s.facility, s.group?.display, choice(s.status)?.label, city(s.physical_address)].filter(Boolean).join(' · ')}
                </Popup>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
      {!single && (
        <div className="map-legend">
          {[...colors.values()].map(({ label, color }) => (
            <span key={label}>
              <i style={{ background: color }} /> {label}
            </span>
          ))}
          {missing > 0 && <span className="muted">{missing} without coordinates</span>}
        </div>
      )}
    </div>
  );
}
