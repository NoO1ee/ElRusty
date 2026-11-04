import { GRID_SIZE, gridCount, gridLocation } from './world';
export type EventType = 'cargo' | 'heli' | 'smalloil' | 'largeoil';
export type EventStatus = 'active' | 'hacking' | 'unlocked' | 'ended' | 'destroyed';
export interface GameEvent {
  current?: boolean;
  id: string;
  type: EventType;
  source: 'team' | 'server';
  status: EventStatus;
  observedAt: number;
  startedAt?: number;
  x?: number;
  y?: number;
  grid?: string;
  direction?: string;
  reporter?: { steamId: string; name: string };
}
export interface EventIdentity {
  mapSize: number;
  seed?: number;
  wipeTime: number;
}
export interface SavedEvents {
  identity: EventIdentity;
  entries: GameEvent[];
}
export interface EventSnapshot {
  entries: GameEvent[];
  server: { configured: boolean; fresh: boolean; lastContact: number | null };
}
export const eventTypes: EventType[] = ['cargo', 'heli', 'smalloil', 'largeoil'];
export const gameEventNames: Record<EventType, string> = {
  cargo: 'Cargo Ship',
  heli: 'Patrol Helicopter',
  smalloil: 'Small Oil Rig',
  largeoil: 'Large Oil Rig',
};
export const eventStatusNames: Record<EventStatus, string> = {
  active: 'observerad',
  hacking: 'hackning startad',
  unlocked: 'hackning klar',
  ended: 'inte längre pågående',
  destroyed: 'förstörd',
};
export function eventFresh(e: GameEvent, now: number, serverFresh: boolean) {
  return e.source === 'server' ? serverFresh && e.current !== false : now - e.observedAt <= 900000;
}
export function eventLocation(e: GameEvent, mapSize: number) {
  return (
    e.grid ||
    (e.x !== undefined && e.y !== undefined ? gridLocation(e.x, e.y, mapSize) : 'position okänd')
  );
}
export function gridArea(input: string, size: number) {
  const match = /^([A-Z]{1,3})(0|[1-9]\d{0,2})$/.exec(input.trim().toUpperCase());
  if (!match) return null;
  let col = 0;
  for (const c of match[1]) col = col * 26 + c.charCodeAt(0) - 64;
  col--;
  const row = Number(match[2]),
    count = gridCount(size);
  if (col >= count || row >= count) return null;
  return {
    grid: match[1] + row,
    x: (col + 0.5) * GRID_SIZE,
    y: (count - row - 0.5) * GRID_SIZE,
    size: GRID_SIZE,
  };
}
export function compass(x: number, y: number, size: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(Math.atan2(x - size / 2, y - size / 2) / (Math.PI / 4) + 8) % 8
  ];
}
