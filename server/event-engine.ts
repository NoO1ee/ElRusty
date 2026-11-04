import type { LiveService } from './service.ts';
import { TextQueue, plainText } from './chat.ts';
import { insist } from './validation.ts';
import {
  eventTypes,
  gameEventNames,
  eventStatusNames,
  eventLocation,
  gridArea,
  type EventType,
  type GameEvent,
  type SavedEvents,
  type EventIdentity,
  type EventSnapshot,
} from '../shared/events.ts';
export class EventEngine {
  private queue = new TextQueue();
  private dirty = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(
    readonly service: LiveService,
    private now = () => Date.now(),
  ) {
    service.on('sessionLost', this.lost);
    this.timer = setInterval(() => this.flush(), 60000);
    this.timer.unref?.();
  }
  private lost = () => this.queue.clear();
  identity(): EventIdentity | null {
    const world = this.service.world?.snapshot();
    return world?.profileId === this.service.config.activeProfileId && world.info
      ? { mapSize: world.info.mapSize, seed: world.info.seed, wipeTime: world.info.wipeTime }
      : null;
  }
  private data(): SavedEvents | null {
    const id = this.service.config.activeProfileId,
      identity = this.identity();
    if (!id || !identity) return null;
    this.service.config.gameEvents ??= {};
    const old = this.service.config.gameEvents[id];
    if (!old || JSON.stringify(old.identity) !== JSON.stringify(identity)) {
      this.service.config.gameEvents[id] = { identity, entries: [] };
      this.dirty = true;
    }
    return this.service.config.gameEvents[id];
  }
  snapshot(): EventSnapshot {
    return {
      entries: this.data()?.entries || [],
      server: { configured: false, fresh: false, lastContact: null },
    };
  }
  report(type: string, value: string, actor: { steamId: string; name: string }, notifyRust = true) {
    insist(
      eventTypes.includes(type as EventType),
      'Eventtyp: cargo, heli, smalloil eller largeoil.',
    );
    const { gen } = this.service.liveSession();
    insist(
      this.service.teamUpdatedAt &&
        this.now() - this.service.teamUpdatedAt <= 15000 &&
        this.service.team.some((m) => m.steamId === actor.steamId),
      'Du finns inte i det aktuella teamet.',
    );
    const data = this.data();
    insist(data, 'Kartinformation saknas. Anslut servern först.');
    const status =
      value.toLowerCase() === 'end'
        ? 'ended'
        : type === 'cargo' || type === 'heli'
          ? 'active'
          : 'hacking';
    const area = status === 'active' ? gridArea(value, data.identity.mapSize) : null;
    insist(
      status === 'ended' || (status === 'hacking' && value.toLowerCase() === 'start') || !!area,
      'Ange en giltig kartruta, start för Oil Rig eller end.',
    );
    let entry = data.entries.find(
      (e) => e.source === 'team' && e.type === type && e.status !== 'ended',
    );
    insist(status !== 'ended' || entry, 'Ingen öppen lagrapport finns för detta event.');
    const announce = !entry || entry.status !== status;
    if (!entry) {
      entry = {
        id: crypto.randomUUID(),
        type: type as EventType,
        source: 'team',
        status,
        observedAt: this.now(),
      };
      data.entries.unshift(entry);
    }
    entry.status = status;
    entry.observedAt = this.now();
    entry.reporter = { steamId: actor.steamId, name: plainText(actor.name, 60) };
    if (area) {
      entry.grid = area.grid;
      entry.x = area.x;
      entry.y = area.y;
    }
    data.entries = data.entries.slice(0, 100);
    this.dirty = true;
    if (announce) this.flush(true);
    this.service.changed();
    if (announce) this.announce(entry, gen, notifyRust);
    return this.describe(entry);
  }
  describe(e: GameEvent) {
    const age = Math.max(0, Math.floor((this.now() - e.observedAt) / 60000));
    return plainText(
      `${gameEventNames[e.type]} · ${eventStatusNames[e.status]} · ${eventLocation(e, this.identity()?.mapSize || 0)}${e.direction ? ' · från ' + e.direction : ''} · ${e.source === 'team' ? 'lagrapport av ' + e.reporter?.name : 'serverbekräftat'} · ${age} min sedan${e.source === 'team' && age >= 15 ? ' · inaktuell' : ''}${e.startedAt ? ' · start ' + new Date(e.startedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : ''}`,
      350,
    );
  }
  reply(type?: EventType) {
    const entries = this.snapshot().entries.filter((e) => !type || e.type === type);
    const newest = entries.filter(
      (e, i) => entries.findIndex((x) => x.type === e.type && x.source === e.source) === i,
    );
    return newest.length
      ? newest.map((e) => this.describe(e)).join(' | ')
      : 'Eventinformation saknas. Använd !report för en lagrapport; automatisk information kräver serverplugin.';
  }
  command(command: string, arg: string, actor: { steamId: string; name: string }) {
    if (command !== 'report')
      return this.reply(command === 'events' ? undefined : (command as EventType));
    const match = /^(cargo|heli|smalloil|largeoil)\s+(\S+)$/i.exec(arg);
    insist(
      match,
      'Syntax: !report cargo A10 / heli A10 / smalloil start / largeoil start / <typ> end',
    );
    return this.report(match[1].toLowerCase(), match[2], actor, false);
  }
  announce(e: GameEvent, gen: number, notifyRust = true) {
    const text = plainText(this.describe(e), 350),
      event = this.service.log('info', text);
    if (!event) return;
    this.service.emit('gameEvent', event);
    const session = this.service.liveSession(),
      epoch = this.service.profileEpoch;
    const valid = () =>
      this.service.isLiveSession(gen) &&
      this.service.profileEpoch === epoch &&
      this.service.config.activeProfileId === event.profileId;
    if (notifyRust)
      this.queue.push(
        plainText('[ElRusty] ' + text, 120),
        async (message) => {
          if (valid()) await session.adapter.chat(message);
        },
        valid,
      );
  }
  flush(force = false) {
    if (force || this.dirty) {
      this.service.db.save(this.service.config);
      this.dirty = false;
    }
  }
  close() {
    clearInterval(this.timer);
    this.queue.clear();
    this.flush();
    this.service.off('sessionLost', this.lost);
  }
}
