import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { LiveService } from './service.ts';
import type { EventEngine } from './event-engine.ts';
import { insist, UserError } from './validation.ts';
import { eventTypes, compass, type GameEvent } from '../shared/events.ts';
export class EventSource {
  private state: {
    profileId: string;
    session: string;
    sequence: number;
    lastContact: number;
  } | null = null;
  private retired = new Set<string>();
  constructor(
    private service: LiveService,
    private engine: EventEngine,
    private now = () => Date.now(),
  ) {}
  reset() {
    if (this.state) this.state.lastContact = 0;
  }
  private retire(id: string) {
    this.retired.add(id);
    if (this.retired.size > 100) this.retired.delete(this.retired.values().next().value!);
  }
  snapshot() {
    const id = this.service.config.activeProfileId;
    return {
      configured: !!(id && this.service.config.eventKeys?.[id]),
      fresh:
        !!this.state &&
        this.state.profileId === id &&
        this.service.connection === 'connected' &&
        this.now() - this.state.lastContact <= 15000,
      lastContact: this.state?.profileId === id ? this.state.lastContact || null : null,
    };
  }
  authenticate(profileId: unknown, key: string) {
    const expected =
      typeof profileId === 'string' ? this.service.config.eventKeys?.[profileId] : undefined;
    return (
      !!expected &&
      /^[a-f0-9]{64}$/.test(key) &&
      timingSafeEqual(Buffer.from(key), Buffer.from(expected))
    );
  }
  configure(directory: string) {
    const id = this.service.config.activeProfileId;
    insist(id && this.service.config.profiles.some((p) => p.id === id), 'Välj en serverprofil.');
    this.service.config.eventKeys ??= {};
    this.service.config.eventKeys[id] ??= randomBytes(32).toString('hex');
    this.service.db.save(this.service.config);
    const folder = join(directory, 'event-plugins');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const filename = id + '.json';
    writeFileSync(
      join(folder, filename),
      JSON.stringify(
        {
          Endpoint: 'http://127.0.0.1:5184/ingest',
          ProfileId: id,
          Key: this.service.config.eventKeys[id],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    this.service.changed();
    return { filename };
  }
  accept(body: any) {
    insist(
      body &&
        body.version === 1 &&
        typeof body.profileId === 'string' &&
        body.profileId === this.service.config.activeProfileId,
      'Fel serverprofil.',
    );
    const { gen } = this.service.liveSession(),
      identity = this.engine.identity();
    insist(
      identity &&
        body.identity &&
        body.identity.mapSize === identity.mapSize &&
        body.identity.seed === identity.seed &&
        body.identity.wipeTime === identity.wipeTime,
      'Fel karta eller wipe.',
    );
    insist(
      typeof body.sessionId === 'string' &&
        /^[a-f0-9-]{36}$/i.test(body.sessionId) &&
        !this.retired.has(body.sessionId),
      'Ogiltig session.',
    );
    insist(
      Number.isSafeInteger(body.sequence) &&
        body.sequence > 0 &&
        typeof body.baseline === 'boolean',
      'Ogiltig sekvens.',
    );
    insist(
      Number.isFinite(body.sentAt) && Math.abs(this.now() - body.sentAt) <= 60000,
      'För gammalt paket.',
    );
    const old = this.state,
      same = old?.profileId === body.profileId && old!.session === body.sessionId;
    insist(!same || body.sequence > old!.sequence, 'Paketet har redan behandlats.');
    const baseline = !same || this.now() - old!.lastContact > 15000;
    insist(!baseline || body.baseline, 'En ny baslinje krävs.');
    insist(Array.isArray(body.events) && body.events.length <= 100, 'Ogiltig eventlista.');
    const ids = new Set<string>();
    const entries: GameEvent[] = body.events.map((e: any) => {
      insist(
        e &&
          typeof e.id === 'string' &&
          /^[a-zA-Z0-9:_-]{1,100}$/.test(e.id) &&
          !ids.has(e.id) &&
          eventTypes.includes(e.type),
        'Ogiltigt event.',
      );
      ids.add(e.id);
      insist(
        ['active', 'hacking', 'unlocked', 'ended', 'destroyed'].includes(e.status),
        'Ogiltig eventstatus.',
      );
      insist(
        e.type === 'cargo' || e.type === 'heli'
          ? !['hacking', 'unlocked'].includes(e.status)
          : e.status !== 'active',
        'Fel status för eventtyp.',
      );
      insist(
        Number.isFinite(e.x) &&
          Number.isFinite(e.y) &&
          Math.abs(e.x) <= identity.mapSize * 3 &&
          Math.abs(e.y) <= identity.mapSize * 3,
        'Ogiltig position.',
      );
      insist(
        e.startedAt === undefined ||
          (Number.isFinite(e.startedAt) && e.startedAt > 0 && e.startedAt <= this.now() + 60000),
        'Ogiltig starttid.',
      );
      insist(
        (e.spawnX === undefined && e.spawnY === undefined) ||
          (Number.isFinite(e.spawnX) && Number.isFinite(e.spawnY)),
        'Ogiltig spawnposition.',
      );
      return {
        id: e.id,
        type: e.type,
        source: 'server',
        status: e.status,
        x: e.x,
        y: e.y,
        observedAt: this.now(),
        ...(e.startedAt ? { startedAt: e.startedAt } : {}),
        ...(e.spawnX !== undefined
          ? { direction: compass(e.spawnX, e.spawnY, identity.mapSize) }
          : {}),
        current: true,
      };
    });
    // Validate the whole packet before advancing sequence or changing stored events.
    if (old && old.profileId === body.profileId && !same) this.retire(old.session);
    this.state = {
      profileId: body.profileId,
      session: body.sessionId,
      sequence: body.sequence,
      lastContact: this.now(),
    };
    this.engine.applyServer(entries, baseline || body.baseline, gen);
    this.service.changed();
    return { ok: true };
  }
}
export function createEventReceiver(service: LiveService) {
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/ingest') {
      reply(404, { error: 'Hittades inte.' });
      return;
    }
    if (req.headers.origin) {
      reply(403, { error: 'Otillåtet ursprung.' });
      return;
    }
    const auth = req.headers.authorization || '',
      key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    // Reject unrecognised keys before buffering request bodies.
    const profile = Object.keys(service.config.eventKeys || {}).find((id) =>
      service.events.source.authenticate(id, key),
    );
    if (!profile) {
      reply(401, { error: 'Ogiltig anslutningsnyckel.' });
      return;
    }
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 65536) {
          reply(413, { error: 'För stort paket.' });
          return;
        }
      }
      const body = JSON.parse(raw);
      insist(body.profileId === profile, 'Fel serverprofil.');
      reply(200, service.events.source.accept(body));
    } catch (e) {
      reply(409, {
        error: e instanceof UserError ? e.message : 'Eventpaketet kunde inte behandlas.',
        baseline: true,
      });
    }
  });
}
