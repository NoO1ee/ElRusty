import { useEffect, useRef, useState } from 'react';
import { Expand, Shrink, Layers, Plus, Minus, LocateFixed, RefreshCw, X } from 'lucide-react';
import { liveAction } from '../live-store';
import type { LiveSnapshot } from '../../shared/live';
import { eventNames, gridCount, GRID_SIZE, gridLocation, imagePosition } from '../../shared/world';
import { monumentLabels } from '../../shared/map-presentation';

function MarkerSymbol({ type }: { type: number }) {
  // Independently drawn symbols; no assets or application code copied from Rust+.
  if (type === 100) return <path d="M0 9S-6 1-6-3a6 6 0 0 1 12 0C6 1 0 9 0 9zM-2-3h4" />;
  if (type === 101) return <path d="M-5 2a7 7 0 1 1 10 0v5H-5zM-3-3h1M2-3h1M-2 3v4M2 3v4" />;
  if (type === 3)
    return (
      <g>
        <path d="M-6-4h12v9H-6zM-7-4l2-4H5l2 4M-2 5V0h4v5M-7-4h14" />
        <path d="M-5-8v4M0-8v4M5-8v4" />
      </g>
    );
  if (type === 5)
    return (
      <g>
        <path d="M-8 2h16L5 7H-5zM-5 2v-6h8v6M0-4v-4h3M-7 9l3-1 4 1 4-1 3 1" />
      </g>
    );
  if (type === 6)
    return (
      <g>
        <path d="M-6-5h12V7H-6zM-6-5l6-3 6 3M0-8V7M-6-2H6" />
      </g>
    );
  if (type === 2) return <path d="M0-9l2 6 6-3-3 6 5 3-7 1 1 6-5-5-5 3 1-6-5-3 7-1z" />;
  return (
    <g>
      <path d="M-5-2h8l4 4-2 3H-4l-2-3-5-2v-3l5 1M0-2v-5M-8-7H8M-4 7h9M-2 5v2M3 5v2" />
    </g>
  );
}
type Marker = {
  id: string;
  x: number;
  y: number;
  name: string;
  kind: 'monument' | 'team' | 'shop' | 'event' | 'waypoint' | 'death';
  approximate?: boolean;
  noteSource?: 'self' | 'leader';
  color: string;
  type?: number;
  online?: boolean;
  alive?: boolean;
  at: number | null;
};
export function LiveMap({ data, offline }: { data: LiveSnapshot; offline: boolean }) {
  const world = data.world,
    map = world?.map;
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [unit, setUnit] = useState(1),
    [view, setView] = useState({ x: 0, y: 0, z: 1 }),
    [selected, setSelected] = useState<string | null>(null),
    [layerMenu, setLayerMenu] = useState(false),
    [expanded, setExpanded] = useState(false),
    [layers, setLayers] = useState({
      grid: true,
      monuments: true,
      team: true,
      shops: true,
      events: true,
      notes: true,
      death: true,
    });
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ x: number; y: number; vx: number; vy: number; scale: number } | null>(null);
  const connected = !offline && data.connection === 'connected';
  async function load() {
    setLoading(true);
    try {
      await liveAction('map/load');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Start closer to the playable island, rather than showing mostly ocean.
    const z = map ? Math.min(1.8, map.width / (map.width - 2 * map.oceanMargin)) : 1;
    setView({
      x: map ? (map.width - map.width / z) / 2 : 0,
      y: map ? (map.height - map.height / z) / 2 : 0,
      z,
    });
    setSelected(null);
    if (connected && !map) void load();
  }, [world?.profileId, map?.revision, connected]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    node.addEventListener('wheel', prevent, { passive: false });
    return () => node.removeEventListener('wheel', prevent);
  }, [map?.revision]);
  useEffect(() => {
    const node = svg.current;
    if (!node || !map) return;
    const resize = () => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) setUnit(Math.max(map.width / r.width, map.height / r.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [map?.revision]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false);
        setLayerMenu(false);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  function zoom(factor: number, cx?: number, cy?: number) {
    if (!map) return;
    setView((v) => {
      const x = cx ?? v.x + map.width / (2 * v.z),
        y = cy ?? v.y + map.height / (2 * v.z),
        z = Math.min(12, Math.max(1, v.z * factor));
      return { x: x - ((x - v.x) * v.z) / z, y: y - ((y - v.y) * v.z) / z, z };
    });
  }
  const u = unit / view.z;
  const monuments = map && layers.monuments ? monumentLabels(map.monuments, map, view, unit) : [];
  const markers: Marker[] = map
    ? [
        ...monuments.map((m) => ({
          id: 'monument' + m.index,
          x: m.x,
          y: m.y,
          name: m.name,
          kind: 'monument' as const,
          color: '#f5f0dc',
          at: world?.updatedAt ?? null,
        })),
        ...(layers.shops || layers.events
          ? (world?.markers || [])
              .filter((m) => (m.type === 3 ? layers.shops : layers.events && !!eventNames[m.type]))
              .map((m) => ({
                id: 'marker' + m.id,
                x: m.x,
                y: m.y,
                name: m.name || eventNames[m.type] || 'Vending Machine',
                kind: m.type === 3 ? ('shop' as const) : ('event' as const),
                type: m.type,
                color: m.type === 3 ? (m.outOfStock ? '#a9aca1' : '#b7d789') : '#f2c477',
                at: world?.updatedAt ?? null,
              }))
          : []),
        ...(layers.notes
          ? (data.mapNotes || [])
              .filter((n) => n.type !== 2)
              .map((n) => ({
                id: 'note:' + n.id,
                x: n.x,
                y: n.y,
                name: n.label || (n.source === 'self' ? 'Din waypoint' : 'Teamledarens waypoint'),
                kind: 'waypoint' as const,
                type: n.icon === 6 ? 101 : 100,
                color: n.source === 'self' ? '#f2d57b' : '#85c7ed',
                noteSource: n.source,
                at: data.teamUpdatedAt,
              }))
          : []),
        ...(layers.death && data.lastDeath
          ? [
              {
                id: 'last-death',
                x: data.lastDeath.x,
                y: data.lastDeath.y,
                name: 'Din senaste dödsplats',
                kind: 'death' as const,
                type: 101,
                color: '#ff9e9d',
                at: data.lastDeath.at || data.lastDeath.observedAt,
                approximate: data.lastDeath.approximate,
              },
            ]
          : []),
        ...(layers.team
          ? data.team
              .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y))
              .map((m) => ({
                id: m.steamId,
                x: m.x!,
                y: m.y!,
                name: m.name + (m.isLeader ? ' · Leader' : ''),
                kind: 'team' as const,
                color: m.isOnline ? '#bded72' : '#a2aea5',
                online: m.isOnline,
                alive: m.isAlive,
                at: data.teamUpdatedAt,
              }))
          : []),
      ]
    : [];
  const chosen = markers.find((m) => m.id === selected);
  return (
    <section
      className={'live-map-panel rustplus-map' + (expanded ? ' expanded' : '')}
      aria-label="Livekarta"
    >
      <div className="live-map-caption">
        <div>
          <h2>Livekarta</h2>
          <span>{world?.info?.name || 'Rust+'}</span>
        </div>
        <span className={connected ? 'map-live' : 'map-stale'}>
          {connected ? '● LIVE' : 'Inaktuell information · anslut till Rust+ för uppdateringar.'}
        </span>
      </div>
      {(error || world?.error) && (
        <p role="alert" className="live-error">
          {error || world?.error}
        </p>
      )}
      <div className="live-map-canvas">
        {!map ? (
          <div className="empty">
            <h3>{loading ? 'Hämtar serverns karta…' : 'Ingen karta hämtad'}</h3>
            <p>Öppna en ansluten server för att visa kartan.</p>
          </div>
        ) : (
          <svg
            ref={svg}
            aria-label="Rust-serverns livekarta"
            viewBox={`${view.x} ${view.y} ${map.width / view.z} ${map.height / view.z}`}
            onWheel={(e) => {
              e.stopPropagation();
              const point = e.currentTarget.createSVGPoint();
              point.x = e.clientX;
              point.y = e.clientY;
              const matrix = e.currentTarget.getScreenCTM();
              if (matrix) {
                const p = point.matrixTransform(matrix.inverse());
                zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
              }
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as Element).closest('[data-marker]')) return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                vx: view.x,
                vy: view.y,
                scale: e.currentTarget.getScreenCTM()?.a || 1,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              setLayerMenu(false);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d)
                setView((v) => ({
                  ...v,
                  x: d.vx - (e.clientX - d.x) / d.scale,
                  y: d.vy - (e.clientY - d.y) / d.scale,
                }));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <image
              href={'/api/live/map/image?revision=' + map.revision}
              width={map.width}
              height={map.height}
            />
            {layers.grid &&
              Array.from({ length: gridCount(map.mapSize) }, (_, i) => {
                const a = imagePosition(i * GRID_SIZE, 0, map),
                  b = imagePosition(0, i * GRID_SIZE, map);
                const col = gridLocation(
                  i * GRID_SIZE + 1,
                  gridCount(map.mapSize) * GRID_SIZE - 1,
                  map.mapSize,
                ).replace(/\d+$/, '');
                const row = gridLocation(1, i * GRID_SIZE + 1, map.mapSize).replace(/^[A-Z]+/, '');
                return (
                  <g key={i} className="map-grid" pointerEvents="none">
                    <path
                      d={`M ${a.x} ${map.oceanMargin} V ${map.height - map.oceanMargin} M ${map.oceanMargin} ${b.y} H ${map.width - map.oceanMargin}`}
                      stroke="white"
                      strokeOpacity=".24"
                      strokeWidth=".6"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={a.x + 3 * u} y={map.oceanMargin + 12 * u} fontSize={10 * u}>
                      {col}
                    </text>
                    <text x={map.oceanMargin + 3 * u} y={b.y - 3 * u} fontSize={10 * u}>
                      {row}
                    </text>
                  </g>
                );
              })}
            {markers.map((m) => {
              const p = imagePosition(m.x, m.y, map);
              return (
                <g
                  key={m.id}
                  data-marker={m.kind}
                  role="button"
                  tabIndex={0}
                  aria-label={m.name}
                  aria-pressed={m.id === selected}
                  onClick={() => setSelected(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(m.id);
                    }
                  }}
                  transform={`translate(${p.x},${p.y}) scale(${u})`}
                  className={'map-marker ' + m.kind}
                >
                  <title>
                    {m.name} · {gridLocation(m.x, m.y, map.mapSize)}
                  </title>
                  {m.kind === 'monument' ? (
                    <>
                      <rect
                        x={-Math.max(44, m.name.length * 5.9) / 2}
                        y="-13"
                        width={Math.max(44, m.name.length * 5.9)}
                        height="26"
                        rx="3"
                        fill={m.id === selected ? '#172a22cc' : 'transparent'}
                      />
                      <text
                        className="map-monument-name"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {m.name.toUpperCase()}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle
                        r={m.kind === 'team' ? 7 : 11}
                        fill={m.kind === 'team' ? m.color : '#1c302be8'}
                        stroke={m.id === selected ? 'white' : m.color}
                        strokeWidth="1.5"
                      />
                      {m.kind === 'team' ? (
                        <>
                          {m.alive === false && (
                            <path d="M-3-3l6 6M3-3l-6 6" stroke="#253426" strokeWidth="2" />
                          )}
                          <text className="map-team-name" y="-15" textAnchor="middle">
                            {m.name}
                          </text>
                        </>
                      ) : (
                        <g
                          fill="none"
                          stroke={m.color}
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <MarkerSymbol type={m.type!} />
                        </g>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        <div className="map-floating map-layer-control">
          <button
            aria-label="Kartlager"
            aria-expanded={layerMenu}
            onClick={() => setLayerMenu((v) => !v)}
          >
            <Layers size={17} />
            <span>Lager</span>
          </button>
          {layerMenu && (
            <div className="live-map-tools" aria-label="Kartlager">
              <strong>Visa på kartan</strong>
              {(Object.keys(layers) as (keyof typeof layers)[]).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
                  />
                  {
                    {
                      grid: 'Koordinatrutor',
                      monuments: 'Monument',
                      team: 'Team',
                      shops: 'Vending machines',
                      events: 'Event',
                      notes: 'Waypoints',
                      death: 'Senaste dödsplats',
                    }[key]
                  }
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="map-floating map-navigation">
          <button
            aria-label={expanded ? 'Minimera kartan' : 'Utöka kartan'}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Shrink size={18} /> : <Expand size={18} />}
          </button>
          <button
            aria-label="Visa hela kartan"
            title="Visa hela kartan"
            disabled={!map}
            onClick={() => setView({ x: 0, y: 0, z: 1 })}
          >
            <LocateFixed size={18} />
          </button>
          <button aria-label="Zooma in kartan" disabled={!map} onClick={() => zoom(1.5)}>
            <Plus size={19} />
          </button>
          <button aria-label="Zooma ut kartan" disabled={!map} onClick={() => zoom(1 / 1.5)}>
            <Minus size={19} />
          </button>
          <button
            aria-label="Hämta karta"
            title="Hämta karta"
            disabled={!connected || loading}
            onClick={() => void load()}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
        <div className="map-compass" aria-label="Norr">
          N<span>↑</span>
        </div>
        {!connected && map && <div className="map-stale-label">Inaktuell information</div>}
        {chosen && map && (
          <aside className="live-map-detail">
            <button
              className="map-detail-close"
              aria-label="Stäng kartdetaljer"
              onClick={() => setSelected(null)}
            >
              <X size={16} />
            </button>
            <span className="eyebrow">
              {chosen.kind === 'monument'
                ? 'MONUMENT'
                : chosen.kind === 'team'
                  ? 'TEAM'
                  : chosen.kind === 'shop'
                    ? 'BUTIK'
                    : chosen.kind === 'waypoint'
                      ? chosen.noteSource === 'self'
                        ? 'DIN WAYPOINT'
                        : 'TEAMLEDARENS WAYPOINT'
                      : chosen.kind === 'death'
                        ? 'SENASTE DÖDSPLATS'
                        : 'EVENT'}
            </span>
            <strong>{chosen.name}</strong>
            <p>
              Kartruta {gridLocation(chosen.x, chosen.y, map.mapSize)}
              {chosen.kind === 'team'
                ? ' · ' +
                  (chosen.online ? 'Online' : 'Offline') +
                  ' · ' +
                  (chosen.alive ? 'Alive' : 'Dead')
                : ''}
            </p>
            {chosen.approximate && (
              <p className="map-location-note">
                Ungefärlig position från senaste teamuppdateringen.
              </p>
            )}
            <small>
              {chosen.kind === 'death' ? 'Registrerad' : 'Uppdaterad'}{' '}
              {chosen.at ? new Date(chosen.at).toLocaleTimeString('sv-SE') : '—'}
            </small>
          </aside>
        )}
        <div className="map-hint">Dra för att panorera · scrolla för att zooma</div>
      </div>
    </section>
  );
}
