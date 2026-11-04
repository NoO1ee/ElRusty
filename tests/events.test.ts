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
    timeInfo: async () => ({time:12,timeScale:0,sunrise:6,sunset:18,dayLengthMinutes:60}),
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
