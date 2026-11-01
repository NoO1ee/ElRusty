import type { LiveService } from './service.ts';
import type { Member, TeamObservation, SavedTeamObservations } from '../shared/live.ts';
import type { LastDeath } from '../shared/team-map.ts';
import { gridLocation } from '../shared/world.ts';
export class TeamObservations {
  private profileId: string | null = null;
  private wipeKey = '';
  private data: SavedTeamObservations | undefined;
  private previous: Map<string, Member> | undefined;
  private previousAt: number | undefined;
  private dirty = false;
  private savedAt = 0;
  constructor(
    private service: LiveService,
    private monotonic = () => performance.now(),
  ) {}
  start(id: string, wipeKey: string) {
    this.stop();
    this.profileId = id;
    this.wipeKey = wipeKey;
    const old = this.service.config.teamObservations?.[id];
    this.data = old?.wipeKey === wipeKey ? old : { wipeKey, members: {} };
    this.savedAt = this.monotonic();
    if (old && old.wipeKey !== wipeKey) {
      this.dirty = true;
      this.flush(true);
    }
  }
  interrupt() {
    this.previous = undefined;
    this.previousAt = undefined;
  }
  stop() {
    this.flush(true);
    this.profileId = null;
    this.interrupt();
  }
  snapshot(id: string): TeamObservation | undefined {
    return this.data?.members[id];
  }
  private flush(force = false) {
    if (
      !this.dirty ||
      !this.profileId ||
      !this.data ||
      (!force && this.monotonic() - this.savedAt < 60000)
    )
      return;
    this.service.config.teamObservations ??= {};
    this.service.config.teamObservations[this.profileId] = this.data;
    this.service.db.save(this.service.config);
    this.savedAt = this.monotonic();
    this.dirty = false;
  }
  observe(team: Member[], ownDeath: LastDeath | null) {
    if (!this.profileId || !this.data) return;
    const at = this.service.timing().now,
      mono = this.monotonic(),
      elapsed = this.previousAt === undefined ? 0 : mono - this.previousAt;
    const continuous = !!this.previous && elapsed >= 0 && elapsed <= 15000;
    const owner = this.service.config.profiles.find((p) => p.id === this.profileId)?.playerId;
    let changed = false;
    for (const m of team) {
      const previous = continuous ? this.previous?.get(m.steamId) : undefined;
      const old = this.data.members[m.steamId];
      const o = old ?? { name: m.name, onlineMs: 0 };
      this.data.members[m.steamId] = o;
      o.name = m.name;
      if (!old) changed = true;
      if (m.isOnline) {
        o.lastSeenOnlineAt = at;
        if (previous?.isOnline) o.onlineMs += elapsed;
        this.dirty = true;
      }
      const deathAt =
        m.deathTime && Number.isFinite(m.deathTime) && m.deathTime * 1000 <= at + 60000
          ? m.deathTime * 1000
          : undefined;
      if (deathAt && (!o.lastDeathAt || deathAt > o.lastDeathAt)) {
        o.lastDeathAt = deathAt;
        this.dirty = true;
      }
      if (m.steamId === owner && ownDeath) {
        o.lastDeath = ownDeath;
        this.dirty = true;
      }
      if (previous && previous.isOnline !== m.isOnline) {
        this.service.log('team', `${m.name} gick ${m.isOnline ? 'online' : 'offline'}.`, {
          event: m.isOnline ? 'online' : 'offline',
          steamId: m.steamId,
        });
        changed = true;
      }
      const died =
        previous &&
        ((previous.isAlive && !m.isAlive) || (m.deathTime || 0) > (previous.deathTime || 0));
      if (died) {
        o.lastDeathAt = deathAt || at;
        if (m.steamId === owner && ownDeath) o.lastDeath = ownDeath;
        else if (previous.isAlive && Number.isFinite(previous.x) && Number.isFinite(previous.y))
          o.lastDeath = {
            x: previous.x!,
            y: previous.y!,
            at: deathAt || at,
            observedAt: at,
            approximate: true,
          };
        else o.lastDeath = undefined;
        const pos = o.lastDeath,
          size = this.service.world?.snapshot().info?.mapSize;
        const location =
          pos && size
            ? `${gridLocation(pos.x, pos.y, size)}${pos.approximate ? ' (ungefärlig)' : ''}`
            : 'plats okänd';
        this.service.log('team', `${m.name} dog · ${location}.`, {
          event: 'death',
          steamId: m.steamId,
          ...(pos ? { position: { x: pos.x, y: pos.y, approximate: pos.approximate } } : {}),
        });
        changed = true;
      }
      if (changed) this.dirty = true;
    }
    // Bound former members while retaining everybody in the current team.
    const current = new Set(team.map((m) => m.steamId));
    const former = Object.entries(this.data.members)
      .filter(([id]) => !current.has(id))
      .sort((a, b) => (b[1].lastSeenOnlineAt || 0) - (a[1].lastSeenOnlineAt || 0));
    for (const [id] of former.slice(100)) delete this.data.members[id];
    this.previous = new Map(team.map((m) => [m.steamId, { ...m }]));
    this.previousAt = mono;
    this.flush(changed);
  }
}
