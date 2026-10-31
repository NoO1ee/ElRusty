import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService, formatTime } from '../server/service';
import { authorized, dispatchDiscord } from '../server/discord';
import { parsePairing } from '../shared/pairing';
import { profile, discord, mode } from '../server/validation';
import type { Entity } from '../shared/live';
import type { RustAdapter } from '../server/rust';
class FakeRust extends EventEmitter implements RustAdapter {
  values = new Map<number, Entity>([
    [1, { type: 'switch', value: false }],
    [2, { type: 'alarm', value: false }],
    [3, { type: 'switch', value: false }],
  ]);
  open = vi.fn(async () => {});
  close = vi.fn();
  info = vi.fn(async () => {});
  team = vi.fn(async () => [
    { steamId: '76561198000000000', name: 'Owner', isOnline: true, isAlive: true },
  ]);
  entity = vi.fn(async (id: number) => {
    const e = this.values.get(id);
    if (!e) throw Error('unknown');
    return structuredClone(e);
  });
  set = vi.fn(async (id: number, value: boolean) => {
    this.values.get(id)!.value = value;
  });
  time = vi.fn(async () => 18.7);
  chat = vi.fn(async (_message: string) => {});
}
const input = {
  name: 'Test',
  host: '127.0.0.1',
  port: 28082,
  playerId: '76561198000000000',
  playerToken: 1234567,
  useProxy: false,
};
const all: { s: LiveService; db: LiveDB }[] = [];
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function setup() {
  let now = 10000;
  const db = new LiveDB(':memory:'),
    adapters: FakeRust[] = [];
  const s = new LiveService(
    db,
    () => {
      const a = new FakeRust();
      adapters.push(a);
      return a;
    },
    () => now,
  );
  all.push({ s, db });
  const id = s.saveProfile(input);
  s.connect(id);
  await flush();
  return { s, db, id, a: adapters[0], adapters, tick: (n = 6000) => (now += n) };
}
afterEach(() => {
  for (const { s, db } of all.splice(0)) {
    s.close();
    db.close();
  }
  vi.useRealTimers();
});
describe('Liveanslutning och styrning', () => {
  it('autentiserar, läser team och exponerar inga hemligheter', async () => {
    const { s, a } = await setup();
    s.saveDiscord({
      guildId: '12345678901234567',
      channelId: '',
      userIds: [],
      roleIds: [],
      token: 'super-secret',
    });
    const snapshot = s.snapshot();
    expect(snapshot.connection).toBe('connected');
    expect(snapshot.team[0].name).toBe('Owner');
    expect(a.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(snapshot)).not.toContain('super-secret');
    expect(JSON.stringify(snapshot)).not.toContain('1234567,');
    expect(snapshot.profiles[0]).not.toHaveProperty('playerToken');
  });
  it('verifierar enheter och bekräftar switchstatus efter skrivning', async () => {
    const { s, a } = await setup();
    const d = await s.addDevice({ name: 'Lampor', entityId: 1, group: 'Bas' });
    expect(d.type).toBe('switch');
    expect(s.snapshot().verified).toContain(d.id);
    const result = await s.run([{ deviceId: d.id, value: true }]);
    expect(result[0].ok).toBe(true);
    expect(a.set).toHaveBeenCalledWith(1, true);
    expect(s.snapshot().states[d.id].value).toBe(true);
    expect(s.snapshot().pending).toEqual([]);
    await expect(s.addDevice({ name: 'Dublett', entityId: 1 })).rejects.toThrow('redan');
  });
  it('visar delresultat för lägen och ändrar endast valda enheter', async () => {
    const { s, a } = await setup();
    const d1 = await s.addDevice({ name: 'Ljus', entityId: 1, group: 'Bas' }),
      d2 = await s.addDevice({ name: 'Maskin', entityId: 3, group: 'Bas' });
    const m = s.saveMode({
      name: 'Natt',
      values: [
        { deviceId: d1.id, value: true },
        { deviceId: d2.id, value: false },
      ],
    });
    a.set.mockImplementation(async (id, value) => {
      if (id === 3) throw Error('no');
      a.values.get(id)!.value = value;
    });
    const result = await s.runMode(m.id);
    expect(result.map((r) => r.ok)).toEqual([true, false]);
    expect(s.snapshot().states[d1.id].value).toBe(true);
    expect(s.snapshot().states[d2.id].value).toBe(false);
  });
  it('kör grupper genom samma kö och avvisar oregistrerade enheter', async () => {
    const { s, a } = await setup();
    await s.addDevice({ name: 'Ljus', entityId: 1, group: 'Bas' });
    await s.addDevice({ name: 'Annat', entityId: 3, group: 'Annan' });
    expect((await s.runGroup('Bas', true)).every((r) => r.ok)).toBe(true);
    expect(a.set).toHaveBeenCalledTimes(1);
    await expect(s.run([{ deviceId: 'foreign', value: true }])).rejects.toThrow('Ogiltig');
  });
  it('avbryter köade kommandon vid serverbyte och ignorerar gamla händelser', async () => {
    const { s, a, id, adapters } = await setup();
    const d1 = await s.addDevice({ name: 'A', entityId: 1 }),
      d2 = await s.addDevice({ name: 'B', entityId: 3 });
    let release!: () => void;
    a.set.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const running = s.run([
      { deviceId: d1.id, value: true },
      { deviceId: d2.id, value: true },
    ]);
    await flush();
    const next = s.saveProfile({ ...input, name: 'Andra' });
    s.connect(next);
    await flush();
    release();
    await running;
    a.emit('entity', 1, { value: true });
    expect(a.set).toHaveBeenCalledTimes(1);
    expect(adapters[1].set).not.toHaveBeenCalled();
    expect(s.snapshot().devices).toEqual([]);
    expect(s.snapshot().states).toEqual({});
    expect(s.snapshot().activeProfileId).not.toBe(id);
  });
  it('återansluter med ny verifiering och återspelar inte kommandon', async () => {
    vi.useFakeTimers();
    const { s, a, adapters } = await setup();
    const d = await s.addDevice({ name: 'Ljus', entityId: 1 });
    a.emit('lost');
    expect(s.snapshot().connection).toBe('reconnecting');
    expect(s.snapshot().verified).toEqual([]);
    await expect(s.run([{ deviceId: d.id, value: true }])).rejects.toThrow('inte anslutet');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.snapshot().connection).toBe('connected');
    expect(adapters[1].entity).toHaveBeenCalledWith(1);
    expect(adapters[1].set).not.toHaveBeenCalled();
  });
  it('nekad autentisering aktiverar inte styrning', async () => {
    const { s, adapters } = await setup();
    const a = new FakeRust();
    a.info.mockRejectedValue(Error('invalid token'));
    const db = new LiveDB(':memory:'),
      bad = new LiveService(db, () => a);
    all.push({ s: bad, db });
    bad.connect(bad.saveProfile(input));
    await flush();
    expect(bad.snapshot().connection).toBe('reconnecting');
    expect(bad.snapshot().team).toEqual([]);
    expect(a.close).toHaveBeenCalled();
    expect(adapters).toHaveLength(1);
    expect(s.snapshot().connection).toBe('connected');
  });
  it('larm triggas på stigande flank, inte vid registrering eller upprepning', async () => {
    const { s, a } = await setup();
    const emit = vi.fn();
    s.on('alarm', emit);
    await s.addDevice({ name: 'Raid', entityId: 2 });
    a.emit('entity', 2, { value: true });
    a.emit('entity', 2, { value: true });
    expect(emit).toHaveBeenCalledOnce();
    a.emit('entity', 2, { value: false });
    a.emit('entity', 2, { value: true });
    expect(emit).toHaveBeenCalledTimes(2);
    expect(s.snapshot().activity.filter((e) => e.kind === 'alarm')).toHaveLength(2);
  });
  it('tar bort beroenden och bevarar profiler/lägen vid omladdning', async () => {
    const { s, db } = await setup();
    const d = await s.addDevice({ name: 'Ljus', entityId: 1 });
    s.saveMode({ name: 'Natt', values: [{ deviceId: d.id, value: true }] });
    expect(db.load().modes[0].name).toBe('Natt');
    s.deleteDevice(d.id);
    expect(db.load().modes).toEqual([]);
    expect(db.load().devices).toEqual([]);
  });
});
describe('!time', () => {
  const msg = (time = 1, steamId = input.playerId) => ({ steamId, message: '  !TiMe  ', time });
  it('svarar i teamchatten även på det parade kontots kommando', async () => {
    const { s, a } = await setup();
    await s.onChat(msg());
    expect(a.chat).toHaveBeenCalledWith('[ElRusty] Speltid: 18:42');
    await s.onChat({ steamId: input.playerId, message: '[ElRusty] Speltid: 18:42', time: 2 });
    expect(a.time).toHaveBeenCalledOnce();
  });
  it('deduplicerar, begränsar svar och accepterar nya kommandon efter cooldown', async () => {
    const { s, a, tick } = await setup();
    await s.onChat(msg());
    await s.onChat(msg(2));
    tick();
    await s.onChat(msg());
    expect(a.time).toHaveBeenCalledOnce();
    await s.onChat(msg(3, '76561198000000001'));
    expect(a.time).toHaveBeenCalledTimes(2);
  });
  it('tillåter bara en pågående fråga och cooldown räknas från svaret', async () => {
    const { s, a, tick } = await setup();
    let finish!: (n: number) => void;
    a.time.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const pending = s.onChat(msg());
    tick(10000);
    await s.onChat(msg(2));
    finish(0);
    await pending;
    await s.onChat(msg(3));
    expect(a.time).toHaveBeenCalledOnce();
    expect(a.chat).toHaveBeenCalledWith('[ElRusty] Speltid: 00:00');
  });
  it('skickar ett kort fel när tidsfrågan misslyckas', async () => {
    const { s, a } = await setup();
    a.time.mockRejectedValue(Error('secret'));
    await s.onChat(msg());
    expect(a.chat).toHaveBeenCalledWith('[ElRusty] Kunde inte hämta speltiden.');
  });
  it('skickar inget fördröjt svar efter frånkoppling', async () => {
    const { s, a } = await setup();
    let finish!: (n: number) => void;
    a.time.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const pending = s.onChat(msg());
    s.disconnect();
    finish(12);
    await pending;
    expect(a.chat).not.toHaveBeenCalled();
  });
  it('återanslutning återbesvarar inte en gammal händelse', async () => {
    vi.useFakeTimers();
    const { s, a, adapters, tick } = await setup();
    await s.onChat(msg());
    a.emit('lost');
    tick();
    await vi.advanceTimersByTimeAsync(1000);
    await s.onChat(msg());
    expect(adapters[1].time).not.toHaveBeenCalled();
  });
  it('formaterar dygnsskifte och avvisar ogiltiga tider', () => {
    expect(formatTime(24)).toBe('00:00');
    expect(formatTime(23.999)).toBe('23:59');
    expect(formatTime(0.5)).toBe('00:30');
    expect(() => formatTime(NaN)).toThrow();
  });
});
describe('validering, parning och Discord-behörigheter', () => {
  it('nekar verklig kommandodispatch innan Rust+ anropas och delar webbstyrningens kö', async () => {
    const { s, a } = await setup();
    const d = await s.addDevice({ name: 'Ljus', entityId: 1 });
    s.config.discord = {
      guildId: 'g',
      channelId: '',
      token: 'secret',
      userIds: ['owner'],
      roleIds: [],
    };
    const command = {
      guildId: 'g',
      userId: 'stranger',
      roles: [],
      command: 'switch',
      name: d.id,
      value: true,
    };
    await expect(dispatchDiscord(s, command)).rejects.toThrow('behörighet');
    expect(a.set).not.toHaveBeenCalled();
    expect(await dispatchDiscord(s, { ...command, userId: 'owner' })).toContain('✓ Ljus');
    expect(a.set).toHaveBeenCalledWith(1, true);
  });
  it('accepterar aldrig en roll från en annan Discord-server', () => {
    const c = { guildId: 'guild', channelId: '', userIds: ['owner'], roleIds: ['control'] };
    expect(authorized(c, 'guild', 'owner', [])).toBe(true);
    expect(authorized(c, 'guild', 'other', ['control'])).toBe(true);
    expect(authorized(c, 'other', 'owner', ['control'])).toBe(false);
    expect(authorized(c, null, 'owner', [])).toBe(false);
    expect(authorized(c, 'guild', 'other', [])).toBe(false);
  });
  it('importerar parning utan att avrunda SteamID och stöder meddelandekropp', () => {
    const p = { ip: '1.2.3.4', port: '28082', playerId: input.playerId, playerToken: '-123' };
    expect(parsePairing(JSON.stringify({ body: JSON.stringify(p) }))).toMatchObject({
      host: '1.2.3.4',
      playerId: input.playerId,
      playerToken: '-123',
    });
    expect(() => parsePairing(JSON.stringify({ ...p, playerId: Number(input.playerId) }))).toThrow(
      'textsträng',
    );
  });
  it('validerar profiler, ID och serverbundna lägen innan lagring', async () => {
    const { s } = await setup();
    expect(() => profile({ ...input, playerToken: 2147483648 })).toThrow('int32');
    expect(() => profile({ ...input, host: 'http://invalid/path' })).toThrow('serveradress');
    expect(() => discord({ guildId: 'invalid' }, s.config.discord)).toThrow();
    expect(() =>
      mode(
        { name: 'Bad', values: [{ deviceId: 'foreign', value: true }] },
        s.config,
        s.config.activeProfileId!,
      ),
    ).toThrow('ogiltig switch');
    expect(() => s.saveProfile({ ...input, playerId: 123 })).toThrow();
  });
});

it('protokollfel visas tydligt och återansluter med bibehållen profil', async () => {
  vi.useFakeTimers();
  const { s, a, id, adapters } = await setup();
  const device = await s.addDevice({ name: 'Ljus', entityId: 1 });
  a.emit('lost', 'protocol');
  expect(s.snapshot().connection).toBe('reconnecting');
  expect(s.snapshot().connectionError).toContain('meddelande som inte kunde tolkas');
  expect(s.snapshot().activeProfileId).toBe(id);
  expect(s.config.profiles[0].playerToken).toBe(input.playerToken);
  expect(s.snapshot().verified).toEqual([]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.snapshot().connection).toBe('connected');
  expect(adapters[1].entity).toHaveBeenCalledWith(1);
  expect(adapters[1].set).not.toHaveBeenCalled();
  expect(s.snapshot().devices[0].id).toBe(device.id);
});

it('upprepade protokollfel efter serverinfo ökar retry-väntan tills anslutningen är stabil', async () => {
  vi.useFakeTimers();
  const { s, a, adapters } = await setup();
  a.emit('lost', 'protocol');
  await vi.advanceTimersByTimeAsync(1000);
  expect(adapters).toHaveLength(2);
  adapters[1].emit('lost', 'protocol');
  await vi.advanceTimersByTimeAsync(1000);
  expect(adapters).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(adapters).toHaveLength(3);
  adapters[2].emit('lost', 'protocol');
  await vi.advanceTimersByTimeAsync(3999);
  expect(adapters).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(adapters).toHaveLength(4);
  await vi.advanceTimersByTimeAsync(30000);
  expect(s.snapshot().connection).toBe('connected');
  adapters[3].emit('lost', 'protocol');
  await vi.advanceTimersByTimeAsync(1000);
  expect(adapters).toHaveLength(5);
});
