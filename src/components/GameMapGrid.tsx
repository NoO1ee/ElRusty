import { imagePosition, gridCount, GRID_SIZE } from '../../shared/world';
import { mapGridLabels } from '../../shared/map-presentation';
export function GameMapGrid({
  map,
  unit,
}: {
  map: { width: number; height: number; oceanMargin: number; mapSize: number };
  unit: number;
}) {
  const count = Math.min(128, gridCount(map.mapSize)),
    limit = count * GRID_SIZE;
  const top = imagePosition(0, limit, map),
    bottom = imagePosition(limit, 0, map);
  return (
    <g className="map-grid" pointerEvents="none">
      {Array.from({ length: count + 1 }, (_, i) => {
        const p = imagePosition(i * GRID_SIZE, i * GRID_SIZE, map);
        return (
          <path
            key={i}
            d={`M ${p.x} ${top.y} V ${bottom.y} M ${top.x} ${p.y} H ${bottom.x}`}
            fill="none"
            stroke="#14252c"
            strokeOpacity=".28"
            strokeWidth=".65"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {mapGridLabels(map, unit).map((c) => {
        const p = imagePosition(c.x, c.y, map);
        return (
          <text
            key={c.label}
            data-grid-cell={c.label}
            className="map-grid-label"
            x={p.x}
            y={p.y}
            fontSize={10 * unit}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {c.label}
          </text>
        );
      })}
    </g>
  );
}
