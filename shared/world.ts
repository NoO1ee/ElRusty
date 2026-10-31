export interface ServerInfo {
  name: string;
  mapSize: number;
  wipeTime: number;
  seed?: number;
  players: number;
  maxPlayers: number;
  queuedPlayers?: number;
}
export interface MapMarker {
  id: number;
  type: number;
  x: number;
  y: number;
  name: string;
  outOfStock?: boolean;
}
export interface MapData {
  width: number;
  height: number;
  oceanMargin: number;
  jpgImage: Uint8Array;
  monuments: { token: string; x: number; y: number }[];
}
export interface WorldSnapshot {
  profileId: string | null;
  info: ServerInfo | null;
  map: {
    revision: string;
    width: number;
    height: number;
    oceanMargin: number;
    mapSize: number;
    monuments: MapData['monuments'];
  } | null;
  markers: MapMarker[];
  updatedAt: number | null;
  error: string;
}
export const eventNames: Record<number, string> = {
  2: 'Explosion',
  4: 'Chinook',
  5: 'Cargo Ship',
  6: 'Locked Crate',
  8: 'Patrol Helicopter',
};
export const GRID_SIZE = 146.25;
export function gridLocation(x: number, y: number, size: number) {
  const rows = Math.floor(size / GRID_SIZE) + (size % GRID_SIZE >= 120 ? 1 : 0),
    limit = rows * GRID_SIZE;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !rows ||
    x < 0 ||
    y < 0 ||
    x > limit ||
    y > limit
  )
    return 'Utanför rutnätet';
  let col = Math.min(rows - 1, Math.floor(x / GRID_SIZE)) + 1,
    label = '';
  while (col) {
    col--;
    label = String.fromCharCode(65 + (col % 26)) + label;
    col = Math.floor(col / 26);
  }
  return label + Math.min(rows - 1, Math.floor((limit - y) / GRID_SIZE));
}
export function imagePosition(
  x: number,
  y: number,
  map: { width: number; height: number; oceanMargin: number; mapSize: number },
) {
  return {
    x: map.oceanMargin + (x * (map.width - 2 * map.oceanMargin)) / map.mapSize,
    y: map.height - map.oceanMargin - (y * (map.height - 2 * map.oceanMargin)) / map.mapSize,
  };
}
