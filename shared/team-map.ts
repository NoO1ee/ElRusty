import type { Member } from './live';
export interface TeamMapNote {
  id: string;
  source: 'self' | 'leader';
  type: number;
  x: number;
  y: number;
  label: string;
  icon?: number;
  colourIndex?: number;
}
export interface LastDeath {
  x: number;
  y: number;
  at: number | null;
  observedAt: number;
  approximate: boolean;
}
const position = (p: { x?: number; y?: number } | undefined): p is { x: number; y: number } =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
export function nextLastDeath(
  old: LastDeath | null,
  previous: Member | undefined,
  current: Member | undefined,
  notes: TeamMapNote[],
  now: number,
): LastDeath | null {
  // Type 2 is the server's death note; a custom skull icon alone is not a death.
  const note = [...notes].reverse().find((n) => n.source === 'self' && n.type === 2 && position(n));
  let candidate: LastDeath | null = null;
  const at = current?.deathTime ? current.deathTime * 1000 : null;
  if (note) candidate = { x: note.x, y: note.y, at, observedAt: now, approximate: false };
  else if (
    current &&
    ((previous &&
      ((previous.isAlive && !current.isAlive) ||
        (current.deathTime || 0) > (previous.deathTime || 0))) ||
      (!previous && !current.isAlive && at))
  ) {
    // A spawn position is never treated as a death position. Missing dead coordinates
    // fall back to the previous live sample, explicitly marked approximate.
    const p = !current.isAlive && position(current) ? current : previous;
    if (position(p)) candidate = { x: p.x, y: p.y, at, observedAt: now, approximate: true };
  }
  if (!candidate) return old;
  if (
    old &&
    old.x === candidate.x &&
    old.y === candidate.y &&
    old.at === candidate.at &&
    old.approximate === candidate.approximate
  )
    return old;
  return candidate;
}
