import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { parseTimerDuration } from '../shared/timers';
import type { Member } from '../shared/live';
import { helpReply } from '../server/read-commands';
const owner = '76561198000000000',
  friend = '76561198000000001',
  other = '76561198000000002';
const clean: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
class Fake extends EventEmitter {
  members: Member[] = [owner, friend, other].map((steamId, i) => ({
    steamId,
    name: ['Owner', 'Friend', 'Other'][i],
    isAlive: true,
    isOnline: true,
  }));
  wipe = 1;
  open = vi.fn(async () => {});
  close = vi.fn();
  info = vi.fn(async () => ({
    name: 'Test',
    mapSize: 1000,
    wipeTime: this.wipe,
    players: 3,
    maxPlayers: 10,
  }));
  team = vi.fn(async () => structuredClone(this.members));
  entity = async () => ({ type: 'switch' as const, value: false });
  set = vi.fn(async () => {});
  time = async () => 12;
  chat = vi.fn(async (_text: string) => {});
}
async function fixture(db = new LiveDB(':memory:'), closeDB = true) {
  const a = new Fake(),
    s = new LiveService(db, () => a);
  if (closeDB) clean.push(() => db.close());
  clean.push(() => s.close());
  const id =
    s.config.profiles[0]?.id ||
    s.saveProfile({ name: 'Test', host: 'localhost', port: 1, playerId: owner, playerToken: 1 });
  s.connect(id);
  await flush();
  return {
    s,
    a,
    db,
    id,
    add: (name = 'Oil Rig', duration = '10s', actor?: { steamId: string; name: string }) =>
      s.timers.create({ name, duration }, actor),
  };
}
function clock() {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
}
function tempDB() {
  const dir = mkdtempSync(join(tmpdir(), 'elrusty-timer-'));
  clean.push(() => {
    if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe temp path');
    rmSync(dir, { recursive: true, force: true });
  });
  return join(dir, 'live.sqlite');
}

it('tolkar ordnade enheter, gränser och avvisar felaktiga tider', () => {
  expect(parseTimerDuration('90s')).toBe(90000);
  expect(parseTimerDuration('1h30m')).toBe(5400000);
  expect(parseTimerDuration('10s')).toBe(10000);
  expect(parseTimerDuration('7d')).toBe(604800000);
  for (const value of [
    '',
    '15',
    '1m1h',
    '1m1m',
    '9s',
    '8d',
    '1.5m',
    '-1m',
    '1h 30m',
    '999999999999999999d',
    null,
  ])
    expect(() => parseTimerDuration(value)).toThrow();
  expect(helpReply('timer')).toContain('cancel');
});
it('migrerar v1 utan att ändra befintlig konfiguration eller aktivitet', () => {
  const path = tempDB(),
    raw = new DatabaseSync(path);
  raw.exec(
    'CREATE TABLE config(id INTEGER PRIMARY KEY,json TEXT NOT NULL);CREATE TABLE activity(id TEXT PRIMARY KEY,at INTEGER NOT NULL,json TEXT NOT NULL);PRAGMA user_version=1;',
  );
  raw.prepare('INSERT INTO config VALUES (1,?)').run(
    JSON.stringify({
      profiles: [],
      devices: [],
      modes: [],
      activeProfileId: null,
      discord: { guildId: '', channelId: '', userIds: [], roleIds: [], token: 'private-test' },
    }),
  );
  raw
    .prepare('INSERT INTO activity VALUES (?,?,?)')
    .run(
      'entry',
      1,
      JSON.stringify({ id: 'entry', kind: 'info', text: 'Preserve', profileId: 'p', at: 1 }),
    );
  raw.close();
  const db = new LiveDB(path);
  clean.push(() => db.close());
  expect(db.load().discord.token).toBe('private-test');
  expect(db.history()[0].text).toBe('Preserve');
  expect(db.sql.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 });
});
it('skapar namngivna timers med unika korta ID:n, begränsar kvot och bevarar befintliga vid valideringsfel', async () => {
  clock();
  const { s, add } = await fixture();
  const a = add(),
    b = add();
  expect(a.name).toBe('Oil Rig');
  expect(a.shortId).toMatch(/^[A-F0-9]{8}$/);
  expect(a.shortId).not.toBe(b.shortId);
  expect(a.creatorId).toBe(owner);
  expect(a.creatorName).toBe('Webbpanelen');
  expect(() => add('', '15m')).toThrow();
  expect(() => add('x'.repeat(61), '15m')).toThrow();
  expect(() => add('Invalid', '5')).toThrow();
  expect(s.snapshot().timers).toHaveLength(2);
  for (let i = 0; i < 18; i++) add();
  expect(() => add()).toThrow('20 aktiva');
  s.timers.cancel(a.shortId.toLowerCase());
  expect(add().state).toBe('active');
});
it('alla kan skapa egna men bara ägare/styrbehöriga kan avbryta andras', async () => {
  clock();
  const { s, id, add } = await fixture();
  const mine = add('Friend timer', '10s', { steamId: friend, name: 'Friend' });
  expect(() => s.timers.cancel(mine.shortId, { steamId: other, name: 'Other' })).toThrow('egna');
  expect(s.timers.cancel(mine.shortId, { steamId: friend, name: 'Friend' }).state).toBe(
    'cancelled',
  );
  const another = add('Another', '10s', { steamId: friend, name: 'Friend' });
  s.setControlUsers(id, [other]);
  expect(s.timers.cancel(another.id, { steamId: other, name: 'Other' }).state).toBe('cancelled');
  expect(() => add('No', '10s', { steamId: 'outsider', name: 'No' })).toThrow('aktuella teamet');
  const web = add();
  expect(() => s.timers.cancel(web.id, { steamId: friend, name: 'Friend' })).toThrow('egna');
  expect(s.timers.cancel(web.id).state).toBe('cancelled');
});
it('timerkommandon delar hjälpen, chattbehörigheter, deduplicering och sidindelning', async () => {
  clock();
  const { s, a, add } = await fixture();
  await s.onChat({ steamId: friend, name: 'Friend', message: '!timer add 15m Oil Rig', time: 1 });
  const first = s.snapshot().timers![0];
  expect(first.name).toBe('Oil Rig');
  expect(first.creatorId).toBe(friend);
  expect(a.chat.mock.calls.map((c) => c[0]).join(' ')).toContain(first.shortId);
  for (let i = 0; i < 5; i++) add('Timer ' + i, '15m');
  const actor = { steamId: owner, name: 'Owner' };
  expect(s.timers.command('timers', '1', actor)).toContain('Sida 1/2');
  expect(s.timers.command('timers', '2', actor)).toContain('Sida 2/2');
  expect(() => s.timers.command('timers', '3', actor)).toThrow('sidan');
  const count = s.snapshot().timers!.length;
  await s.onChat({ steamId: friend, message: '!timer add 15m Oil Rig', time: 1 });
  expect(s.snapshot().timers).toHaveLength(count);
  vi.advanceTimersByTime(6000);
  await s.onChat({ steamId: 'outsider', message: '!timer add 15m Nope', time: 2 });
  expect(s.snapshot().timers).toHaveLength(count);
});
it('utgång är atomisk, avbrutna timers skickas inte och aviseringar är minst en sekund isär', async () => {
  clock();
  const { s, a, add } = await fixture();
  const cancelled = add('Cancelled');
  s.timers.cancel(cancelled.id);
  const starts: number[] = [];
  a.chat.mockImplementation(async () => {
    starts.push(Date.now());
  });
  add('One');
  add('Two');
  add('Three');
  await vi.advanceTimersByTimeAsync(13000);
  expect(a.chat).toHaveBeenCalledTimes(3);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
  expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
  const rows = s.snapshot().timers!;
  expect(
    rows
      .filter((t) => t.state === 'expired')
      .every((t) => t.rust === 'sent' && t.discord === 'missed'),
  ).toBe(true);
  expect(rows.find((t) => t.id === cancelled.id)?.state).toBe('cancelled');
  s.timers.tick();
  await flush();
  expect(a.chat).toHaveBeenCalledTimes(3);
  expect(() => s.timers.cancel(rows.find((t) => t.state === 'expired')!.id)).toThrow('redan');
});
it('Rust och Discord har oberoende resultat och råa fel hamnar inte i status', async () => {
  clock();
  const { s, a, add } = await fixture();
  const discord = vi.fn(async () => true);
  s.timers.discord = () => ({ valid: () => true, send: discord });
  a.chat.mockRejectedValue(Error('token-secret'));
  add('Timer');
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.snapshot().timers![0]).toMatchObject({ rust: 'unconfirmed', discord: 'sent' });
  expect(JSON.stringify(s.snapshot())).not.toContain('token-secret');
});
it('Discord kan avisera medan Rust är frånkopplat utan att Rust får senare utskick', async () => {
  clock();
  const { s, a, add } = await fixture();
  const discord = vi.fn(async () => true);
  s.timers.discord = () => ({ valid: () => true, send: discord });
  add();
  s.connection = 'reconnecting';
  await vi.advanceTimersByTimeAsync(10000);
  expect(a.chat).not.toHaveBeenCalled();
  expect(discord).toHaveBeenCalledOnce();
  expect(s.snapshot().timers![0]).toMatchObject({ rust: 'missed', discord: 'sent' });
  s.connection = 'connected';
  await vi.advanceTimersByTimeAsync(5000);
  expect(a.chat).not.toHaveBeenCalled();
});
it('serverbyte ger missade aviseringar och återspelar inte vid återbesök; wipe behåller framtida timer', async () => {
  clock();
  const { s, a, id, db, add } = await fixture();
  const t = add('Old server');
  const discord = vi.fn(async () => true);
  s.timers.discord = () => ({ valid: () => true, send: discord });
  const next = s.saveProfile({
    name: 'Other',
    host: 'localhost',
    port: 2,
    playerId: owner,
    playerToken: 1,
  });
  s.connect(next);
  await flush();
  await vi.advanceTimersByTimeAsync(10000);
  expect(a.chat).not.toHaveBeenCalled();
  expect(discord).not.toHaveBeenCalled();
  expect(db.timers.get(id, t.id)).toMatchObject({
    state: 'expired',
    rust: 'missed',
    discord: 'missed',
  });
  s.connect(id);
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(a.chat).not.toHaveBeenCalled();
  const future = add('Across wipe', '1m');
  a.wipe = 2;
  s.connect(id);
  await flush();
  expect(s.snapshot().timers!.find((row) => row.id === future.id)?.state).toBe('active');
  s.deleteProfile(id);
  expect(db.timers.get(id, t.id)).toBeUndefined();
});
it('sparade framtida timers överlever omstart medan redan förfallna och avbrutna försök aldrig återspelas', async () => {
  clock();
  const { s, db, id, add } = await fixture();
  const future = add('Future', '1m');
  const overdue = add('Overdue', '10s');
  s.close();
  vi.setSystemTime(Date.now() + 20000);
  const a = new Fake(),
    next = new LiveService(db, () => a);
  clean.push(() => next.close());
  next.connect(id);
  await flush();
  expect(db.timers.get(id, overdue.id)).toMatchObject({
    state: 'expired',
    rust: 'missed',
    discord: 'missed',
  });
  expect(db.timers.get(id, future.id)?.state).toBe('active');
  await vi.advanceTimersByTimeAsync(40000);
  expect(a.chat).toHaveBeenCalledOnce();
  const interrupted = db.timers.create({
    profileId: id,
    name: 'Interrupted',
    creatorId: owner,
    creatorName: 'Owner',
    createdAt: Date.now(),
    dueAt: Date.now(),
  });
  db.timers.claimDue(Date.now(), id, true, true);
  expect(db.timers.attempt(interrupted.id, 'rust')).toBe(true);
  next.close();
  const restored = new LiveService(db, () => new Fake());
  clean.push(() => restored.close());
  expect(db.timers.get(id, interrupted.id)).toMatchObject({
    rust: 'unconfirmed',
    discord: 'missed',
  });
});
it('avbrott tömmer väntande aviseringar även om samma server återansluts', async () => {
  clock();
  const { s, a, add } = await fixture();
  let fail!: (e: Error) => void;
  a.chat.mockImplementationOnce(() => new Promise<void>((_r, reject) => (fail = reject)));
  const first = add('First'),
    second = add('Second');
  await vi.advanceTimersByTimeAsync(10000);
  expect(a.chat).toHaveBeenCalledOnce();
  a.emit('lost');
  fail(Error('disconnected'));
  await vi.advanceTimersByTimeAsync(3000);
  expect(s.snapshot().timers!.find((t) => t.id === first.id)?.rust).toBe('unconfirmed');
  expect(s.snapshot().timers!.find((t) => t.id === second.id)?.rust).toBe('missed');
  expect(a.chat).toHaveBeenCalledOnce();
});
it('full aviseringskö släpper överskott och markerar dem missade', async () => {
  clock();
  const { s, a, add } = await fixture();
  let release!: () => void;
  a.chat.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
  for (let i = 0; i < 20; i++) add('First ' + i);
  await vi.advanceTimersByTimeAsync(10000);
  for (let i = 0; i < 20; i++) add('Overflow ' + i);
  await vi.advanceTimersByTimeAsync(10000);
  expect(
    s
      .snapshot()
      .timers!.filter((t) => t.name.startsWith('Overflow'))
      .every((t) => t.rust === 'missed'),
  ).toBe(true);
  expect(a.chat).toHaveBeenCalledOnce();
  s.close();
  release();
  await flush();
});
it('två schedulerinstanser med separata SQLite-anslutningar gör bara ett utskick', async () => {
  clock();
  const path = tempDB(),
    db1 = new LiveDB(path),
    f1 = await fixture(db1),
    db2 = new LiveDB(path),
    f2 = await fixture(db2);
  f1.add('One');
  await vi.advanceTimersByTimeAsync(10000);
  expect(f1.a.chat.mock.calls.length + f2.a.chat.mock.calls.length).toBe(1);
  expect(db1.timers.list(f1.id)[0].rust).toBe('sent');
});
it('historiken begränsas till 100 och samtidiga cancel/expire kan inte båda vinna', async () => {
  clock();
  const { s, db, id, add } = await fixture();
  let last = '';
  for (let i = 0; i < 105; i++) {
    const t = add('History ' + i);
    last = t.id;
    s.timers.cancel(t.id);
    vi.setSystemTime(Date.now() + 1);
  }
  expect(db.timers.list(id)).toHaveLength(100);
  expect(db.timers.get(id, last)?.state).toBe('cancelled');
  const t = add('Race');
  vi.setSystemTime(t.dueAt);
  expect(() => s.timers.cancel(t.id)).toThrow('redan');
  s.timers.tick();
  await flush();
  expect(db.timers.get(id, t.id)?.state).toBe('expired');
});

it('fel när sändningsförsök sparas skickar inget och stänger inte processen', async () => {
  clock();
  const { s, a, db, add } = await fixture();
  add();
  const fail = vi.spyOn(db.timers, 'attempt').mockImplementationOnce(() => {
    throw Error('private IO detail');
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(a.chat).not.toHaveBeenCalled();
  expect(s.snapshot().timers![0].rust).toBe('missed');
  expect(s.snapshot().timerError).toContain('Ingen avisering');
  expect(JSON.stringify(s.snapshot())).not.toContain('private IO detail');
  fail.mockRestore();
});
