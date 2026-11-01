import type { Member } from '../shared/live.ts';
import type { TeamMapNote } from '../shared/team-map.ts';
const own = (m: any, name: string) => Object.hasOwn(m, name);
export function normalizeTeamInfo(
  team: any,
  playerId: string,
): { members: Member[]; notes: TeamMapNote[] } {
  const members = (team.members || []).map((m: any) => ({
    steamId: String(m.steamId),
    name: String(m.name),
    x: own(m, 'x') && Number.isFinite(m.x) ? Number(m.x) : undefined,
    y: own(m, 'y') && Number.isFinite(m.y) ? Number(m.y) : undefined,
    isOnline: !!m.isOnline,
    isAlive: !!m.isAlive,
    deathTime: own(m, 'deathTime') && m.deathTime > 0 ? Number(m.deathTime) : undefined,
    spawnTime: own(m, 'spawnTime') && m.spawnTime > 0 ? Number(m.spawnTime) : undefined,
    isLeader: String(team.leaderSteamId) === String(m.steamId),
  }));
  const notes: TeamMapNote[] = [];
  for (const source of ['self', 'leader'] as const) {
    // The same leader/personal notes must not appear twice when you lead the team.
    const list =
      source === 'self'
        ? team.mapNotes
        : String(team.leaderSteamId) === playerId
          ? []
          : team.leaderMapNotes;
    for (const [index, n] of (list || []).entries()) {
      if (!own(n, 'x') || !own(n, 'y') || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      notes.push({
        id: source + ':' + index,
        source,
        type: Number.isInteger(n.type) ? Number(n.type) : 0,
        x: Number(n.x),
        y: Number(n.y),
        label: typeof n.label === 'string' ? n.label.slice(0, 100) : '',
        icon: own(n, 'icon') ? Number(n.icon) : undefined,
        colourIndex: own(n, 'colourIndex') ? Number(n.colourIndex) : undefined,
      });
    }
  }
  return { members, notes };
}
