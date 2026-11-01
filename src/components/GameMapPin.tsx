export function GameMapPin({
  death,
  skull,
  leader,
  selected,
  approximate,
  label,
}: {
  death: boolean;
  skull: boolean;
  leader: boolean;
  selected: boolean;
  approximate?: boolean;
  label: string;
}) {
  return (
    <g className={'game-map-pin ' + (death ? 'death-pin' : 'waypoint-pin')}>
      <circle data-marker-hit="true" cx="0" cy="-13" r="20" fill="transparent" />
      <path
        d="M0 0C-3-4-9-10-9-16a9 9 0 0 1 18 0C9-10 3-4 0 0Z"
        fill={death ? '#d9483f' : '#f0e647'}
        stroke={selected ? '#fff' : leader ? '#80d7ff' : '#19241c'}
        strokeWidth={selected || leader ? 2 : 1.3}
        strokeDasharray={approximate ? '3 2' : undefined}
      />
      {skull ? (
        <g transform="translate(0 -16)">
          <path d="M-5 0a6 6 0 1 1 10 0v4H-5zM-3 4v2h6V4" fill="#fff2df" />
          <circle cx="-2" cy="-2" r="1.4" fill="#752e2a" />
          <circle cx="2" cy="-2" r="1.4" fill="#752e2a" />
          <path d="M0 0l-1 2h2z" fill="#752e2a" />
        </g>
      ) : (
        <circle cx="0" cy="-16" r="3.8" fill="#25311a" />
      )}
      {leader && (
        <text x="10" y="-22" className="map-pin-label">
          L
        </text>
      )}
      {approximate && (
        <text x="11" y="-7" className="map-pin-label">
          ≈
        </text>
      )}
      {selected && (
        <text y="-33" textAnchor="middle" className="map-pin-label">
          {label}
        </text>
      )}
    </g>
  );
}
