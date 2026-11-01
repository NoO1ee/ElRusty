import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { LiveWorld } from '../server/world';
import { helpReply, duration } from '../server/read-commands';
import { isKnownCommand } from '../server/chat';
import type { Member } from '../shared/live';
const owner = '76561198000000000',
  friend = '76561198000000001';
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function setup() {
  let now = 1000000,
    t = 0;
  const members: Member[] = [
    {
      steamId: owner,
      name: 'Owner',
      isAlive: true,
      isOnline: true,
      x: 100,
      y: 100,
      spawnTime: 500,
    },
    {
      steamId: friend,
      name: 'Other Player',
      isAlive: true,
      isOnline: true,
      x: 103,
      y: 104,
      spawnTime: 100,
    },
    {
      steamId: '76561198000000002',
      name: 'Sleeping',
      isAlive: true,
      isOnline: false,
      x: 101,
      y: 101,
    },
  ];
  const a = Object.assign(new EventEmitter(), {
    open: vi.fn(async () => {}),
    close: vi.fn(),
    info: vi.fn(async () => ({
      name: 'Test',
      wipeTime: 100,
      mapSize: 4500,
      players: 1,
      maxPlayers: 10,
    })),
    team: vi.fn(async () => structuredClone(members)),
    entity: async () => ({ type: 'switch' as const, value: false }),
    set: vi.fn(async () => {}),
    timeInfo: async () => ({
      time: 12,
      sunrise: 8,
      sunset: 18,
      dayLengthMinutes: 60,
      timeScale: 1,
    }),
    time: async () => 12,
    chat: vi.fn(async (_text: string) => {}),
  });
  const db = new LiveDB(':memory:');
  const service = new LiveService(
    db,
    () => a,
    () => now,
  );
  new LiveWorld(service);
  cleanup.push(() => {
    service.close();
    db.close();
  });
  const id = service.saveProfile({
    name: 'Test',
    host: 'localhost',
    port: 1,
    playerId: owner,
    playerToken: 1,
  });
  service.connect(id);
  await flush();
  return {
    s: service,
    a,
    members,
    send: async (text: string, id = owner) => {
      now += 6000;
      a.chat.mockClear();
      await service.onChat({ steamId: id, message: text, time: ++t });
      return a.chat.mock.calls.map((c) => c[0]).join(' ');
    },
    tick: (ms: number) => (now += ms),
    now: () => now,
  };
}
it('hjälpen har grupper och kommandosyntax men lägger inte till !team eller eventstubbar', () => {
  expect(helpReply('')).toContain('!wipe');
  expect(helpReply('team')).toContain('!prox');
  expect(helpReply('!PrOx')).toContain('tre närmaste');
  expect(() => helpReply('unknown')).toThrow('Okänt');
  expect(isKnownCommand('!team')).toBe(false);
  expect(isKnownCommand('!cargo')).toBe(false);
  expect(isKnownCommand('  !OFFLINE  ')).toBe(true);
  expect(duration(0)).toBe('0 s');
  expect(duration(61000)).toBe('1 min 1 s');
  expect(duration(3600000)).toBe('1 h 0 min');
  expect(duration(90000000)).toBe('1 d 1 h');
  expect(() => duration(-1)).toThrow();
});
it('wipe hämtas från servern och ogiltiga/futura tider visas inte som fakta', async () => {
  const { a, send } = await setup();
  expect(await send('!wipe')).toContain('15 min 6 s');
  a.info.mockResolvedValue({ ...(await a.info()), wipeTime: 0 });
  expect(await send('!wipe')).toContain('ingen giltig wipe-tid');
  a.info.mockResolvedValue({ ...(await a.info()), wipeTime: 9000000 });
  expect(await send('!wipe')).toContain('ingen giltig wipe-tid');
  expect(a.set).not.toHaveBeenCalled();
});
it('online och offline använder teamstatus och SteamID/namn fungerar med mellanslag', async () => {
  const { send } = await setup();
  expect(await send('!online', friend)).toContain('2 online: Owner, Other Player');
  expect(await send('!offline')).toContain('1 offline: Sleeping');
  expect(await send('!steamid Other Player')).toContain(friend);
  expect(await send('!steamid', friend)).toContain(friend);
  expect(await send('!where', friend)).toMatch(/Other Player: [A-Z]+\d+/);
});
it('alive stödjer längst levande, en viss spelare och saknade/döda mål', async () => {
  const { s, send } = await setup();
  expect(await send('!alive')).toContain('Lever längst: Other Player');
  expect(await send('!alive Other Player')).toContain('har levt i');
  expect(await send('!alive Sleeping')).toContain('spawn-tid saknas');
  s.team[1].isAlive = false;
  expect(await send('!alive Other Player')).toContain('är död');
  s.team[0].spawnTime = 999999999;
  expect(await send('!alive')).toContain('Ingen tillförlitlig spawn-tid');
});
it('prox väljer tre närmaste levande online med koordinater och hoppar över okända', async () => {
  const { s, send } = await setup();
  s.team.push(
    ...[20, 10, 30].map((n, i) => ({
      steamId: 'extra' + i,
      name: 'Distance ' + n,
      isAlive: true,
      isOnline: true,
      x: 100 + n,
      y: 100,
    })),
    { steamId: 'dead', name: 'Dead', isAlive: false, isOnline: true, x: 100, y: 100 },
    { steamId: 'unknown', name: 'Unknown', isAlive: true, isOnline: true },
  );
  const text = await send('!prox');
  expect(text).toContain('Other Player 5 m · Distance 10 10 m · Distance 20 20 m');
  expect(text).not.toContain('Distance 30');
  expect(text).not.toContain('Sleeping');
  s.team[0].x = undefined;
  expect(await send('!prox')).toContain('position saknas');
});
it('death använder sparad plats, visar approximation och förväxlar inte lagkamrat med parade kontot', async () => {
  const { s, send, now } = await setup();
  expect(await send('!death')).toContain('Ingen sparad dödsplats');
  s.lastDeath = { x: 120, y: 200, at: now() - 60000, observedAt: now(), approximate: true };
  const text = await send('!death');
  expect(text).toContain('Owner, senaste dödsplats:');
  expect(text).toContain('ungefärlig');
  expect(text).toContain('sedan');
  expect(await send('!death', friend)).toContain('Ingen sparad dödsplats för Other Player');
  expect(await send('!death Owner', friend)).toContain('Owner, senaste dödsplats:');
});
it('uptime skiljer tjänstens livstid från återansluten Rust+ och svar köas inte efter avbrott', async () => {
  vi.useFakeTimers();
  const { s, a, tick, send } = await setup();
  tick(60000);
  expect(await send('!uptime')).toContain('ElRusty: 1 min 6 s · Rust+-anslutning: 1 min 6 s');
  a.emit('lost');
  await vi.advanceTimersByTimeAsync(1000);
  expect(await send('!uptime')).toContain('Rust+-anslutning: 6 s');
  const info = await a.info();
  let finish!: () => void;
  a.info.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(info);
      }),
  );
  const pending = send('!wipe');
  await flush();
  s.disconnect();
  expect(a.chat).not.toHaveBeenCalled();
  finish();
  await pending;
  expect(a.chat).not.toHaveBeenCalled();
});
it('nya läskommandon avvisar utomstående och delar befintlig cooldown', async () => {
  const { s, a, send } = await setup();
  expect(await send('!online', '76561198000000999')).toBe('');
  const stamp = { steamId: owner, message: '!online', time: 100 };
  await s.onChat(stamp);
  const calls = a.chat.mock.calls.length;
  await s.onChat({ ...stamp, message: '!offline', time: 101 });
  expect(a.chat).toHaveBeenCalledTimes(calls);
});
