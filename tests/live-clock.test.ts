import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import type { RustAdapter } from '../server/rust';
import type { RustTimeInfo } from '../shared/time';
const base: RustTimeInfo = { time: 12, sunrise: 6, sunset: 18, dayLengthMinutes: 60, timeScale: 1 };
class Fake extends EventEmitter implements RustAdapter {
  open = vi.fn(async () => {});
  close = vi.fn();
  info = vi.fn(async () => ({
    name: 'Test',
    mapSize: 3500,
    wipeTime: 1,
    players: 1,
    maxPlayers: 10,
  }));
  team = vi.fn(async () => [
    { steamId: '76561198000000000', name: 'Owner', isAlive: true, isOnline: true },
  ]);
  entity = vi.fn(async () => ({ type: 'switch' as const, value: false }));
  set = vi.fn(async () => {});
  chat = vi.fn(async (_m: string) => {});
  timeInfo = vi.fn(async () => ({ ...base }));
  time = vi.fn(async () => (await this.timeInfo()).time);
}
const resources: { s: LiveService; db: LiveDB }[] = [];
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
async function setup(db = new LiveDB(':memory:'), a = new Fake()) {
  const s = new LiveService(db, () => a);
  resources.push({ s, db });
  const id =
    s.config.profiles[0]?.id ||
    s.saveProfile({
      name: 'Test',
      host: 'localhost',
      port: 28082,
      playerId: '76561198000000000',
      playerToken: 1,
      useProxy: false,
    });
  s.connect(id);
  await flush();
  return { s, a, db, id };
}
afterEach(() => {
  for (const { s, db } of resources.splice(0).reverse()) {
    s.close();
    db.close();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('formaterar uppskattning, natt, under minuten, fryst och ogiltiga värden', async () => {
  const { s, a } = await setup();
  expect(await s.clock.reply()).toBe('Speltid: 12:00 · Natt om cirka 15 min (uppskattat).');
  a.timeInfo.mockResolvedValue({ ...base, time: 23 });
  expect(await s.clock.reply()).toContain('Dag om cirka 18 min');
  a.timeInfo.mockResolvedValue({ ...base, time: 17.9 });
  expect(await s.clock.reply()).toContain('mindre än 1 min');
  a.timeInfo.mockResolvedValue({ ...base, timeScale: 0 });
  expect(await s.clock.reply()).toBe('Speltid: 12:00 · Tiden är fryst.');
  a.timeInfo.mockResolvedValue({ ...base, sunset: NaN });
  expect(await s.clock.reply()).toContain('Tid till dag/natt kunde inte beräknas');
  a.timeInfo.mockRejectedValue(Error('private'));
  expect(await s.clock.reply()).toBe('Kunde inte hämta speltiden.');
  expect(s.connection).toBe('connected');
});
it('poll och chatt delar ett pågående tidsanrop och behåller chattens spärr', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  let resolve!: (i: RustTimeInfo) => void;
  a.timeInfo.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  await vi.advanceTimersByTimeAsync(5000);
  const read = s.clock.read();
  const message = { steamId: '76561198000000000', message: '!time', time: 1 };
  const chat = s.onChat(message);
  await s.onChat({ ...message, time: 2 });
  expect(a.timeInfo).toHaveBeenCalledTimes(1);
  resolve(base);
  await read;
  await chat;
  expect(a.chat).toHaveBeenCalledTimes(1);
  expect(a.chat.mock.calls[0][0]).toContain('Natt om cirka');
});
it('tidsfel i bakgrundspoll kopplar inte från och nästa fråga försöker igen', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  a.timeInfo.mockRejectedValueOnce(Error('private-token'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(s.connection).toBe('connected');
  expect(a.chat).not.toHaveBeenCalled();
  expect(await s.clock.reply()).toContain('Speltid:');
  expect(a.timeInfo).toHaveBeenCalledTimes(2);
});
it('gamla tidsanrop kan inte påverka en ny session eller skriva efter stängning', async () => {
  const { s, a, db, id } = await setup();
  let resolve!: (i: RustTimeInfo) => void;
  a.timeInfo.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  const pending = s.clock.read();
  const check = expect(pending).rejects.toThrow();
  s.disconnect();
  s.connect(id);
  await flush();
  resolve(base);
  await check;
  expect(await s.clock.reply()).toContain('uppskattat');
  expect(db.load().timeCalibrations).toBeUndefined();
});
it('sparar endast slutförda faser och återställer kurvor efter omstart och wipe', async () => {
  vi.useFakeTimers();
  const { s, a, db, id } = await setup();
  a.timeInfo.mockImplementation(async () => ({
    ...base,
    time: (6 + performance.now() / 6000) % 24,
    dayLengthMinutes: 2.4,
  }));
  const save = vi.spyOn(s.clock as any, 'persist');
  await s.clock.reply();
  save.mockClear();
  await vi.advanceTimersByTimeAsync(150000);
  expect(db.load().timeCalibrations![id].calibration.day).toHaveLength(1);
  expect(db.load().timeCalibrations![id].calibration.night).toHaveLength(1);
  expect(save).toHaveBeenCalledTimes(2);
  expect(await s.clock.reply()).toContain('(inlärt)');
  s.close();
  const next = new LiveService(db, () => a);
  resources[0].s = next;
  next.connect(id);
  await flush();
  expect(await next.clock.reply()).toContain('(inlärt)');
  a.info.mockResolvedValue({ ...(await a.info()), wipeTime: 2 });
  next.disconnect();
  next.connect(id);
  await flush();
  expect(await next.clock.reply()).toContain('(uppskattat)');
  expect(db.load().timeCalibrations?.[id]).toBeUndefined();
});
it('profilradering tar bort kalibreringen utan att röra andra profiler', async () => {
  const { s, id } = await setup();
  s.config.timeCalibrations = {
    [id]: { wipeKey: 'one', calibration: { reference: base, day: [], night: [] } },
    other: { wipeKey: 'two', calibration: { reference: base, day: [], night: [] } },
  };
  s.deleteProfile(id);
  expect(s.config.timeCalibrations[id]).toBeUndefined();
  expect(s.config.timeCalibrations.other).toBeDefined();
});

it('serverbyte isolerar färdiga kurvor per profil och återanvänder dem först efter färsk läsning', async () => {
  vi.useFakeTimers();
  const { s, a, id, db } = await setup();
  a.timeInfo.mockImplementation(async () => ({
    ...base,
    time: (6 + performance.now() / 6000) % 24,
    dayLengthMinutes: 2.4,
  }));
  await s.clock.reply();
  await vi.advanceTimersByTimeAsync(75000);
  const stored = structuredClone(db.load().timeCalibrations![id]);
  const other = s.saveProfile({
    name: 'Other',
    host: 'other.local',
    port: 28083,
    playerId: '76561198000000000',
    playerToken: 2,
    useProxy: false,
  });
  a.timeInfo.mockResolvedValue({ ...base, dayLengthMinutes: 2.4 });
  s.connect(other);
  await flush();
  expect(await s.clock.reply()).toContain('(uppskattat)');
  expect(db.load().timeCalibrations![id]).toEqual(stored);
  expect(db.load().timeCalibrations?.[other]).toBeUndefined();
  s.connect(id);
  await flush();
  expect(await s.clock.reply()).toContain('(inlärt)');
});
