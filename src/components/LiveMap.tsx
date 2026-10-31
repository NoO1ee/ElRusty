import { useEffect, useRef, useState } from 'react';
import { liveAction } from '../live-store';
import type { LiveSnapshot } from '../../shared/live';
import { eventNames, gridCount, GRID_SIZE, gridLocation, imagePosition } from '../../shared/world';
export function LiveMap({ data, offline }: { data: LiveSnapshot; offline: boolean }) {
  const world = data.world,
    map = world?.map,
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [view, setView] = useState({ x: 0, y: 0, z: 1 }),
    [selected, setSelected] = useState<string | null>(null),
    [layers, setLayers] = useState({
      grid: true,
      monuments: true,
      team: true,
      shops: true,
      events: true,
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
    setView({ x: 0, y: 0, z: 1 });
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
  function zoom(factor: number, cx = map ? map.width / 2 : 0, cy = map ? map.height / 2 : 0) {
    setView((v) => {
      const z = Math.min(12, Math.max(1, v.z * factor));
      return { x: cx - ((cx - v.x) * v.z) / z, y: cy - ((cy - v.y) * v.z) / z, z };
    });
  }
  const markers = map
    ? [
        ...(layers.monuments
          ? map.monuments.map((m, i) => ({
              id: 'monument' + i,
              x: m.x,
              y: m.y,
              name: m.token.replace(/_display_name|_monument_name/g, '').replaceAll('_', ' '),
              icon: '◆',
              color: '#e4d1a2',
            }))
          : []),
        ...(layers.team
          ? data.team
              .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y))
              .map((m) => ({
                id: m.steamId,
                x: m.x!,
                y: m.y!,
                name: m.name + (m.isLeader ? ' · Leader' : '') + (m.isOnline ? '' : ' · Offline'),
                icon: '●',
                color: m.isOnline ? '#8be3bb' : '#94a2b5',
              }))
          : []),
        ...(world?.markers || [])
          .filter((m) => (m.type === 3 ? layers.shops : layers.events && !!eventNames[m.type]))
          .map((m) => ({
            ...m,
            id: 'marker' + m.id,
            name: m.name || eventNames[m.type] || 'Vending Machine',
            icon: m.type === 3 ? '▣' : '▲',
            color: m.type === 3 ? '#86bfff' : '#ff8996',
          })),
      ]
    : [];
  const chosen = markers.find((m) => m.id === selected);
  return (
    <section className="live-panel live-map-panel">
      <div className="live-section-heading">
        <div>
          <h2>Livekarta</h2>
          <p>
            {connected
              ? 'Rust+-serverns karta och senaste positioner.'
              : 'Inaktuell information · anslut till Rust+ för uppdateringar.'}
          </p>
        </div>
        <button disabled={!connected || loading} onClick={() => void load()}>
          {loading ? 'Hämtar…' : 'Hämta karta'}
        </button>
      </div>
      <div className="live-map-tools">
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
              }[key]
            }
          </label>
        ))}
        <button onClick={() => setView({ x: 0, y: 0, z: 1 })}>Visa hela kartan</button>
        <button aria-label="Zooma in kartan" onClick={() => zoom(1.5)}>
          +
        </button>
        <button aria-label="Zooma ut kartan" onClick={() => zoom(1 / 1.5)}>
          −
        </button>
      </div>
      {(error || world?.error) && (
        <p role="alert" className="live-error">
          {error || world?.error}
        </p>
      )}
      {!map ? (
        <div className="empty">
          <h3>{loading ? 'Hämtar serverns karta…' : 'Ingen karta hämtad'}</h3>
          <p>Öppna en ansluten server för att visa kartan.</p>
        </div>
      ) : (
        <div className="live-map-canvas">
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
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) {
                setView((v) => ({
                  ...v,
                  x: d.vx - ((e.clientX - d.x) * 1) / d.scale,
                  y: d.vy - ((e.clientY - d.y) * 1) / d.scale,
                }));
              }
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
                return (
                  <g key={i} opacity=".5" pointerEvents="none">
                    <path
                      d={`M ${a.x} ${map.oceanMargin} V ${map.height - map.oceanMargin} M ${map.oceanMargin} ${b.y} H ${map.width - map.oceanMargin}`}
                      stroke="white"
                      strokeWidth=".6"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={a.x + 3} y={map.oceanMargin + 12} fontSize={10 / view.z} fill="white">
                      {gridLocation(
                        i * GRID_SIZE + 1,
                        gridCount(map.mapSize) * GRID_SIZE - 1,
                        map.mapSize,
                      ).replace(/\d+$/, '')}
                    </text>
                    <text x={map.oceanMargin + 3} y={b.y - 3} fontSize={10 / view.z} fill="white">
                      {gridLocation(1, i * GRID_SIZE + 1, map.mapSize).replace(/^[A-Z]+/, '')}
                    </text>
                  </g>
                );
              })}
            {markers.map((m) => {
              const p = imagePosition(m.x, m.y, map);
              return (
                <g
                  key={m.id}
                  data-marker="true"
                  role="button"
                  tabIndex={0}
                  aria-label={m.name}
                  onClick={() => setSelected(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelected(m.id);
                  }}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ cursor: 'pointer' }}
                >
                  <title>
                    {m.name} · {gridLocation(m.x, m.y, map.mapSize)}
                  </title>
                  <circle r={8 / view.z} fill="#0b1320" stroke={m.color} strokeWidth={1 / view.z} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={m.color}
                    fontSize={11 / view.z}
                  >
                    {m.icon}
                  </text>
                </g>
              );
            })}
          </svg>
          {chosen && (
            <aside className="live-map-detail">
              <strong>{chosen.name}</strong>
              <p>{gridLocation(chosen.x, chosen.y, map.mapSize)}</p>
              <small>
                Uppdaterad{' '}
                {world?.updatedAt ? new Date(world.updatedAt).toLocaleTimeString('sv-SE') : '—'}
              </small>
              <button className="subtle" onClick={() => setSelected(null)}>
                Stäng
              </button>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
