import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { LiveWorld } from '../server/world';
import { gridArea, eventFresh, compass } from '../shared/events';
const resources: { s: LiveService; db: LiveDB }[] = [];
afterEach(() => {
  for (const { s, db } of resources.splice(0)) {
    s.close();
    db.close();
  }
  vi.useRealTimers();
});
async function fixture() {
  vi.useFakeTimers();
  const db = new LiveDB(':memory:');
  const a = Object.assign(new EventEmitter(), {
    open: async () => {},
    close: vi.fn(),
    info: async () => ({
      name: 'Test',
      mapSize: 4500,
      seed: 1,
      wipeTime: 1,
      players: 1,
      maxPlayers: 10,
    }),
    team: async () => [
      { steamId: '76561198000000000', name: 'Owner', isOnline: true, isAlive: true },
    ],
    time: async () => 12,
    timeInfo: async () => ({
      time: 12,
      timeScale: 0,
      sunrise: 6,
      sunset: 18,
      dayLengthMinutes: 60,
    }),
    chat: vi.fn(async (_text: string) => {}),
    entity: async () => ({ type: 'switch' as const, value: false }),
    set: async () => {},
  });
  const s = new LiveService(db, () => a);
  resources.push({ s, db });
  new LiveWorld(s);
  const id = s.saveProfile({
    name: 'Test',
    host: 'localhost',
    port: 1,
    playerId: '76561198000000000',
    playerToken: 1,
  });
  s.connect(id);
  for (let i = 0; i < 40; i++) await Promise.resolve();
  const actor = { steamId: '76561198000000000', name: 'Owner @everyone' };
  return { s, db, a, id, actor };
}
it('validerar kartrutor och använder samma koordinater som kartan', () => {
  expect(gridArea('A0', 4500)).toEqual({ grid: 'A0', x: 73.125, y: 4314.375, size: 146.25 });
  for (const bad of ['A-1', 'A01', 'ZZ99', 'A30', 'A1<script>'])
    expect(gridArea(bad, 4500)).toBeNull();
  expect(compass(2250, 5000, 4500)).toBe('N');
  expect(compass(-100, 2250, 4500)).toBe('W');
});
it('lagrapporter sparar källa och rapportör utan att påstå verifierad starttid', async () => {
  const { s, actor } = await fixture();
  s.events.report('cargo', 'A10', actor, false);
  expect(s.snapshot().gameEvents?.entries[0]).toMatchObject({
    type: 'cargo',
    source: 'team',
    grid: 'A10',
    reporter: { name: 'Owner ＠everyone' },
  });
  expect(s.snapshot().gameEvents?.entries[0].startedAt).toBeUndefined();
  expect(s.events.reply('cargo')).toContain('lagrapport');
  s.events.report('smalloil', 'start', actor, false);
  expect(s.events.reply('smalloil')).toContain('hackning startad');
  expect(() => s.events.report('heli', 'ZZ999', actor)).toThrow('giltig');
  expect(() => s.events.report('smalloil', 'A10', actor)).toThrow('giltig');
});
it('nekar utomstående och frånkopplade rapporter', async () => {
  const { s, actor } = await fixture();
  expect(() => s.events.report('cargo', 'A1', { ...actor, steamId: 'outsider' })).toThrow('teamet');
  s.disconnect();
  expect(() => s.events.report('cargo', 'A1', actor)).toThrow('anslutet');
});
it('uppdaterar positioner utan nya notifieringar och avslutar endast lagets rapport', async () => {
  const { s, actor } = await fixture();
  const notify = vi.fn();
  s.on('gameEvent', notify);
  s.events.report('cargo', 'A1', actor, false);
  s.events.report('cargo', 'B1', actor, false);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(s.events.snapshot().entries).toHaveLength(1);
  s.events.report('cargo', 'end', actor, false);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(() => s.events.report('cargo', 'end', actor, false)).toThrow('öppen');
});
it('märker femton minuter gamla lagrapporter inaktuella', async () => {
  const { s, actor } = await fixture();
  s.events.report('heli', 'A1', actor, false);
  const e = s.events.snapshot().entries[0];
  expect(eventFresh(e, e.observedAt + 900001, false)).toBe(false);
  expect(s.events.reply('cargo')).toContain('saknas');
});
it('nollställer event vid wipe och separerar profiler', async () => {
  const { s, actor } = await fixture();
  s.events.report('cargo', 'A1', actor, false);
  s.world!.state.info!.wipeTime = 2;
  expect(s.events.snapshot().entries).toHaveLength(0);
  s.world!.state.profileId = 'other';
  expect(s.events.snapshot().entries).toHaveLength(0);
});
it('begränsar historik till hundra och återställer utan aviseringar', async () => {
  const { s, actor, db } = await fixture();
  for (let i = 0; i < 105; i++) {
    s.events.report('cargo', 'A1', actor, false);
    s.events.report('cargo', 'end', actor, false);
  }
  expect(s.events.snapshot().entries).toHaveLength(100);
  const saved = db.load().gameEvents;
  expect(saved).toBeDefined();
});
it('släpper köade Rust-notiser vid avbrott', async () => {
  const { s, actor, a } = await fixture();
  s.events.report('cargo', 'A1', actor);
  s.events.report('heli', 'A1', actor);
  expect(a.chat).toHaveBeenCalledTimes(1);
  s.disconnect();
  await vi.advanceTimersByTimeAsync(5000);
  expect(a.chat).toHaveBeenCalledTimes(1);
});

function packet(id: string, sequence = 1, baseline = true) {
  return {
    version: 1,
    profileId: id,
    sessionId: '11111111-1111-4111-8111-111111111111',
    sequence,
    baseline,
    sentAt: Date.now(),
    identity: { mapSize: 4500, seed: 1, wipeTime: 1 },
    events: [
      {
        id: 'cargo:1',
        type: 'cargo',
        status: 'active',
        x: 100,
        y: 4600,
        spawnX: 100,
        spawnY: 4600,
        startedAt: Date.now(),
      },
    ],
  };
}
it('validerar baslinje, sekvens, session, profil och wipe före uppdatering', async () => {
  const { s, id } = await fixture();
  const source = s.events.source,
    notice = vi.fn();
  s.on('gameEvent', notice);
  const first = packet(id);
  source.accept(first);
  expect(notice).not.toHaveBeenCalled();
  expect(source.snapshot().fresh).toBe(true);
  expect(s.events.snapshot().entries[0].direction).toBe('NW');
  expect(() => source.accept(first)).toThrow('redan');
  expect(() =>
    source.accept({ ...first, sequence: 2, identity: { ...first.identity, wipeTime: 2 } }),
  ).toThrow('wipe');
  expect(() => source.accept({ ...first, sequence: 2, profileId: 'other' })).toThrow('profil');
  expect(() =>
    source.accept({ ...first, sequence: 2, events: [{ ...first.events[0], x: NaN }] }),
  ).toThrow('position');
  source.accept({
    ...first,
    sequence: 2,
    baseline: false,
    events: [{ ...first.events[0], status: 'ended' }],
  });
  expect(notice).toHaveBeenCalledOnce();
  const next = { ...packet(id, 1), sessionId: '22222222-2222-4222-8222-222222222222' };
  source.accept(next);
  expect(() => source.accept({ ...first, sequence: 3 })).toThrow('session');
});
it('återansluter samma pluginsession med ny baslinje utan gamla notiser', async () => {
  const { s, id } = await fixture();
  const source = s.events.source,
    notice = vi.fn();
  s.on('gameEvent', notice);
  source.accept(packet(id));
  source.reset();
  expect(source.snapshot().fresh).toBe(false);
  expect(() => source.accept(packet(id, 2, false))).toThrow('baslinje');
  source.accept(packet(id, 2, true));
  expect(notice).not.toHaveBeenCalled();
  expect(source.snapshot().fresh).toBe(true);
});
it('håller serverdata och lagrapporter separata och döljer inte okänd spawn bakom antaganden', async () => {
  const { s, id, actor } = await fixture();
  s.events.report('cargo', 'A1', actor, false);
  const p = packet(id);
  delete (p.events[0] as any).startedAt;
  delete (p.events[0] as any).spawnX;
  delete (p.events[0] as any).spawnY;
  s.events.source.accept(p);
  expect(s.events.snapshot().entries).toHaveLength(2);
  const server = s.events.snapshot().entries.find((e) => e.source === 'server')!;
  expect(server.direction).toBeUndefined();
  expect(server.startedAt).toBeUndefined();
  s.events.source.accept({ ...p, sequence: 2, baseline: false, events: [] });
  expect(
    eventFresh(
      s.events.snapshot().entries.find((e) => e.source === 'server')!,
      Date.now(),
      true,
    ),
  ).toBe(false);
});
it('maskerar anslutningsnycklar i Live-status och accepterar bara rätt nyckel', async () => {
  const { s, id } = await fixture();
  const secret = 'abcdef0123456789'.repeat(4);
  s.config.eventKeys = { [id]: secret };
  expect(s.events.source.authenticate(id, secret)).toBe(true);
  expect(s.events.source.authenticate(id, '0'.repeat(64))).toBe(false);
  expect(s.events.source.authenticate(id, 'x')).toBe(false);
  expect(JSON.stringify(s.snapshot())).not.toContain(secret);
  expect(s.snapshot().gameEvents?.server.configured).toBe(true);
});

it('mottagaren kräver nyckel, avvisar webbläsarursprung och returnerar bara säkra fel', async () => {
  const { s, id } = await fixture();
  const { createEventReceiver } = await import('../server/event-source');
  const { request } = await import('node:http');
  const secret = 'abcdef0123456789'.repeat(4);
  s.config.eventKeys = { [id]: secret };
  const server = createEventReceiver(s);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/ingest',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
        },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve({ status: res.statusCode!, body: text }));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  try {
    expect((await call(packet(id))).status).toBe(401);
    expect(
      (await call(packet(id), { Authorization: 'Bearer ' + secret, Origin: 'http://example.com' }))
        .status,
    ).toBe(403);
    expect((await call(packet(id), { Authorization: 'Bearer ' + secret })).status).toBe(200);
    const duplicate = await call(packet(id), { Authorization: 'Bearer ' + secret });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).not.toContain(secret);
    expect(
      (
        await call(
          { profileId: id, padding: 'x'.repeat(66000) },
          { Authorization: 'Bearer ' + secret },
        )
      ).status,
    ).toBe(413);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

it('skapar privat pluginfil utan att returnera nyckeln och bevarar befintlig nyckel', async () => {
  const { s, id } = await fixture();
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elrusty-event-key-'));
  try {
    const result = s.events.source.configure(root);
    const file = JSON.parse(
      fs.readFileSync(path.join(root, 'event-plugins', result.filename), 'utf8'),
    );
    expect(file.ProfileId).toBe(id);
    expect(file.Key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(file.Key);
    expect(JSON.stringify(s.snapshot())).not.toContain(file.Key);
    s.events.source.configure(root);
    expect(s.config.eventKeys![id]).toBe(file.Key);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
