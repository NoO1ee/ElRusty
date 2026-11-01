import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { Avatars } from '../server/avatars';
import type { Member } from '../shared/live';
const owner = '76561198000000000',
  friend = '76561198000000001';
class Fake extends EventEmitter {
  members: Member[] = [
    {
      steamId: owner,
      name: 'Owner',
      isOnline: true,
      isAlive: true,
      isLeader: true,
      x: 100,
      y: 200,
    },
    { steamId: friend, name: 'Friend', isOnline: false, isAlive: true, x: 300, y: 400 },
  ];
  open = async () => {};
  close = vi.fn();
  info = vi.fn(async () => ({
    name: 'Test',
    mapSize: 3500,
    wipeTime: 1,
    players: 1,
    maxPlayers: 10,
  }));
  team = async () => structuredClone(this.members);
  entity = async () => ({ type: 'switch' as const, value: false });
  set = vi.fn(async () => {});
  time = async () => 12;
  timeInfo = async () => ({ time: 12, timeScale: 0, sunrise: 6, sunset: 18, dayLengthMinutes: 60 });
  chat = vi.fn(async (_text: string) => {});
  chatHistory = vi.fn(async () => [{ steamId: owner, name: 'Owner', message: '!time', time: 1 }]);
}
const all: { s: LiveService; db: LiveDB }[] = [];
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
async function setup(db = new LiveDB(':memory:'), a = new Fake()) {
  const s = new LiveService(db, () => a);
  all.push({ s, db });
  const id =
    s.config.profiles[0]?.id ||
    s.saveProfile({
      name: 'Test',
      host: 'localhost',
      port: 28082,
      playerId: owner,
      playerToken: 1,
      useProxy: false,
    });
  s.connect(id);
  await flush();
  return { s, db, a, id };
}
afterEach(() => {
  for (const r of all.splice(0).reverse()) {
    r.s.close();
    r.db.close();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('historik är endast visning, live dedupliceras och chattext sparas aldrig i konfigurationen', async () => {
  const { s, a, db } = await setup();
  expect(s.snapshot().teamChat).toHaveLength(1);
  expect(a.chat).not.toHaveBeenCalled();
  const m = { steamId: friend, name: 'Friend', message: 'hello private chat', time: 10 };
  await s.onChat(m);
  await s.onChat(m);
  expect(s.snapshot().teamChat).toHaveLength(2);
  expect(JSON.stringify(db.load())).not.toContain('hello private chat');
  for (let n = 11; n < 150; n++) await s.onChat({ ...m, time: n, message: 'line ' + n });
  expect(s.snapshot().teamChat).toHaveLength(100);
});
it('webbchatt skickar från parat konto med prefix och idempotenta klient-ID:n', async () => {
  const { s, a } = await setup();
  const payload = { clientId: 'web-message-001', text: 'Hej @everyone' };
  expect(s.chat.send(payload)).toEqual(s.chat.send(payload));
  await flush();
  expect(a.chat).toHaveBeenCalledTimes(1);
  expect(a.chat).toHaveBeenCalledWith('[Webb] Hej ＠everyone');
  await s.onChat({
    steamId: owner,
    message: '[Webb] Hej ＠everyone',
    time: Math.floor(Date.now() / 1000),
  });
  expect(s.snapshot().teamChat?.filter((m) => m.origin === 'web')).toHaveLength(1);
  expect(s.snapshot().teamChat?.find((m) => m.origin === 'web')?.status).toBe('sent');
  expect(() => s.chat.send({ clientId: 'second-web-id', text: 'x'.repeat(114) })).toThrow();
});
it('chattkön är begränsad och töms vid avbrott utan automatisk återspelning', async () => {
  vi.useFakeTimers();
  const { s, a, id } = await setup();
  let finish!: () => void;
  a.chat.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
  for (let i = 0; i < 20; i++) s.chat.send({ clientId: 'message-' + i, text: 'Hej ' + i });
  expect(() => s.chat.send({ clientId: 'overflow-message', text: 'Hej' })).toThrow('full');
  s.disconnect();
  finish();
  await flush();
  s.connect(id);
  await flush();
  await vi.advanceTimersByTimeAsync(10000);
  expect(a.chat).toHaveBeenCalledTimes(1);
  const lines = s.snapshot().teamChat?.filter((l) => l.origin === 'web') || [];
  expect(lines.filter((l) => l.status === 'unconfirmed')).toHaveLength(1);
  expect(lines.filter((l) => l.status === 'failed')).toHaveLength(19);
});
it('webbchatt väntar minst en sekund mellan sändningar och timeout ger obekräftat utan retry', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  a.chat.mockRejectedValueOnce(Error('private transport'));
  s.chat.send({ clientId: 'first-message', text: 'one' });
  s.chat.send({ clientId: 'second-message', text: 'two' });
  await flush();
  expect(a.chat).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(a.chat).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(a.chat).toHaveBeenCalledTimes(2);
  expect(s.snapshot().teamChat?.find((m) => m.id === 'first-message')?.status).toBe('unconfirmed');
  expect(JSON.stringify(s.snapshot())).not.toContain('private transport');
});
it('omstart och wipe rensar chattminnet; historik utlöser inga kommandon', async () => {
  const { s, a, id, db } = await setup();
  await s.onChat({ steamId: owner, message: 'temporary text', time: 12 });
  a.chatHistory.mockResolvedValue([]);
  a.info.mockResolvedValue({ ...(await a.info()), wipeTime: 2 });
  s.disconnect();
  s.connect(id);
  await flush();
  expect(s.snapshot().teamChat).toEqual([]);
  expect(a.chat).not.toHaveBeenCalled();
  s.close();
  const next = new LiveService(db, () => a);
  all[0].s = next;
  next.connect(id);
  await flush();
  expect(next.snapshot().teamChat).toEqual([]);
});
it('teamets första avläsning är baslinje och tid räknas bara för sammanhängande online-observationer', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  expect(s.snapshot().activity.filter((x) => x.kind === 'team')).toEqual([]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.snapshot().team.find((m) => m.steamId === owner)?.observedOnlineMs).toBe(10000);
  a.members[1].isOnline = true;
  await vi.advanceTimersByTimeAsync(5000);
  expect(s.snapshot().activity.filter((x) => x.event === 'online')).toHaveLength(1);
  a.members[0].isOnline = false;
  await vi.advanceTimersByTimeAsync(5000);
  expect(s.snapshot().activity.filter((x) => x.event === 'offline')).toHaveLength(1);
  const before = s.snapshot().team.find((m) => m.steamId === owner)!.observedOnlineMs;
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.snapshot().team.find((m) => m.steamId === owner)?.observedOnlineMs).toBe(before);
});
it('dödsfall visar föregående position som ungefärlig och saknad position gissas inte', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  a.members[1].isAlive = false;
  a.members[1].deathTime = Math.floor(Date.now() / 1000);
  await vi.advanceTimersByTimeAsync(5000);
  const death = s.snapshot().activity.find((x) => x.event === 'death');
  expect(death?.position).toEqual({ x: 300, y: 400, approximate: true });
  expect(s.snapshot().team.find((m) => m.steamId === friend)?.lastDeath).toMatchObject({
    x: 300,
    y: 400,
    approximate: true,
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(s.snapshot().activity.filter((x) => x.event === 'death')).toHaveLength(1);
});
it('observationer överlever omstart men räknar inte nätgap eller tjänstens nedtid och nollställs vid wipe', async () => {
  vi.useFakeTimers();
  const { s, a, id, db } = await setup();
  await vi.advanceTimersByTimeAsync(10000);
  s.close();
  await vi.advanceTimersByTimeAsync(60000);
  const next = new LiveService(db, () => a);
  all[0].s = next;
  next.connect(id);
  await flush();
  expect(next.snapshot().team[0].observedOnlineMs).toBe(10000);
  next.observations.interrupt();
  await vi.advanceTimersByTimeAsync(5000);
  expect(next.snapshot().team[0].observedOnlineMs).toBe(10000);
  a.info.mockResolvedValue({ ...(await a.info()), wipeTime: 2 });
  next.disconnect();
  next.connect(id);
  await flush();
  expect(next.snapshot().team[0].observedOnlineMs).toBe(0);
});
it('avatarhämtning tillåter bara HTTPS på kända värdar och cachelagrar godkända bilder', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
  );
  vi.stubGlobal('fetch', fetch);
  const avatars = new Avatars();
  expect((await avatars.get(owner)).bytes).toEqual(new Uint8Array([1, 2, 3]));
  await avatars.get(owner);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(
    new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
  );
  await expect(avatars.get(friend)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('saknade dödskoordinater skapar ingen påhittad plats', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  a.members[1].x = undefined;
  a.members[1].y = undefined;
  await vi.advanceTimersByTimeAsync(5000);
  a.members[1].isAlive = false;
  a.members[1].deathTime = Math.floor(Date.now() / 1000);
  await vi.advanceTimersByTimeAsync(5000);
  const event = s.snapshot().activity.find((x) => x.event === 'death');
  expect(event?.text).toContain('plats okänd');
  expect(event?.position).toBeUndefined();
});
