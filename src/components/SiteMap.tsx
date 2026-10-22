import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { config } from '../api';
import type { Site } from '../types';
import { city } from '../utils';

// One color per site group, in order of first appearance (colorblind-friendly palette)
const PALETTE = ['#2f6fde', '#e8743b', '#19a979', '#d64e9a', '#945ecf', '#13a4b4', '#bf9d00', '#6f7d8c'];
const NETHERLANDS: LatLngExpression = [52.2, 5.3];

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export function groupColors(sites: Pick<Site, 'group'>[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const s of sites) {
    const key = s.group?.display ?? 'No group';
    if (!colors.has(key)) colors.set(key, PALETTE[colors.size % PALETTE.length]);
  }
  return colors;
}

export function SiteMap({ sites, height = 420, single = false }: { sites: Site[]; height?: number; single?: boolean }) {
  const located = useMemo(() => sites.filter((s) => s.latitude !== null && s.longitude !== null), [sites]);
  const points = useMemo(() => located.map((s) => [Number(s.latitude), Number(s.longitude)] as [number, number]), [located]);
  const colors = useMemo(() => groupColors(located), [located]);
  const missing = sites.length - located.length;

  return (
    <div className="map-wrap">
      <MapContainer center={NETHERLANDS} zoom={7} style={{ height }} scrollWheelZoom={!single}>
        <TileLayer url={config.mapTiles} attribution={config.mapAttribution} />
        <FitBounds points={points} />
        {located.map((s) => {
          const color = colors.get(s.group?.display ?? 'No group')!;
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
                  {[s.facility, s.group?.display, city(s.physical_address)].filter(Boolean).join(' · ')}
                </Popup>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
      {!single && (
        <div className="map-legend">
          {[...colors].map(([label, color]) => (
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
