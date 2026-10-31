import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { LiveWorld } from '../server/world';
import { DiscordBot } from '../server/discord';
import { TextQueue, plainText } from '../server/chat';
import { discordAccessKey } from '../server/discord-setup';
import type { RustAdapter } from '../server/rust';
import type { Member } from '../shared/live';
const owner = '76561198000000000',
  other = '76561198000000001';
class Fake extends EventEmitter implements RustAdapter {
  members: Member[] = [
    {
      steamId: owner,
      name: 'Owner',
      isAlive: true,
      isOnline: true,
      isLeader: true,
      x: 200,
      y: 200,
    },
    {
      steamId: other,
      name: 'Other Player',
      isAlive: true,
      isOnline: true,
      isLeader: false,
      x: 500,
      y: 600,
    },
  ];
  open = vi.fn(async () => {});
  close = vi.fn();
  info = vi.fn(async () => ({
    name: 'Test',
    mapSize: 4500,
    wipeTime: 1,
    players: 7,
    maxPlayers: 100,
  }));
  team = vi.fn(async () => structuredClone(this.members));
  time = vi.fn(async () => 12);
  chat = vi.fn(async (_text: string) => {});
  value = false;
  entity = vi.fn(async () => ({ type: 'switch' as const, value: this.value }));
  set = vi.fn(async (_id: number, value: boolean) => {
    this.value = value;
  });
  promote = vi.fn(async (id: string) => {
    this.members.forEach((m) => (m.isLeader = m.steamId === id));
  });
}
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function setup() {
  let now = 10000;
  const a = new Fake(),
    db = new LiveDB(':memory:'),
    s = new LiveService(
      db,
      () => a,
      () => now,
    );
  cleanup.push(() => {
    s.close();
    db.close();
  });
  new LiveWorld(s);
  const id = s.saveProfile({
    name: 'Test',
    host: 'localhost',
    port: 28082,
    playerId: owner,
    playerToken: 1,
  });
  s.connect(id);
  await flush();
  let t = 0;
  return {
    s,
    a,
    id,
    db,
    send: async (text: string, steamId = owner) => {
      now += 6000;
      await s.onChat({ steamId, message: text, time: ++t });
    },
    tick: () => (now += 6000),
  };
}
it('läskommandon fungerar för teamet men inte för utomstående', async () => {
  const { s, a, send } = await setup();
  await send('!pop', other);
  expect(a.chat).toHaveBeenLastCalledWith('[ElRusty] Spelare: 7/100');
  await send('!where Other Player', other);
  expect(a.chat.mock.lastCall![0]).toMatch(/Other Player: [A-Z]+\d+/);
  await send('!help', other);
  expect(a.chat.mock.calls.map((c) => c[0]).join(' ')).toContain('!makeleader');
  const calls = a.chat.mock.calls.length;
  await send('!pop', '76561198000000999');
  expect(a.chat).toHaveBeenCalledTimes(calls);
  await send('!events');
  expect(a.chat.mock.lastCall![0]).toContain('eventinformation saknas');
  s.world!.state.updatedAt = 1;
  s.world!.state.markers = [{ id: 1, type: 5, x: 100, y: 100, name: '' }];
  await send('!events');
  expect(a.chat.mock.lastCall![0]).toContain('Cargo Ship');
});
it('köfältet visas bara när Rust+ faktiskt skickar det', async () => {
  const { a, send } = await setup();
  a.info.mockResolvedValue({ ...(await a.info()), queuedPlayers: 0 } as any);
  await send('!pop');
  expect(a.chat).toHaveBeenLastCalledWith('[ElRusty] Spelare: 7/100 · Kö: 0');
});
it('styrning kräver SteamID-behörighet, stöder mellanslag och delar kön', async () => {
  const { s, a, id, send, db } = await setup();
  const d = await s.addDevice({ name: 'Basens Ljus', entityId: 123, group: 'Min Bas' });
  await send('!switch Basens Ljus on', other);
  expect(a.set).not.toHaveBeenCalled();
  expect(a.chat.mock.lastCall![0]).toContain('behörighet');
  s.setControlUsers(id, [other]);
  expect(db.load().profiles[0].controlSteamIds).toEqual([other]);
  await send('!switch Basens Ljus on', other);
  expect(a.set).toHaveBeenLastCalledWith(123, true);
  await send('!group Min Bas off', other);
  expect(a.set).toHaveBeenLastCalledWith(123, false);
  const mode = s.saveMode({ name: 'Natt Läge', values: [{ deviceId: d.id, value: true }] });
  await send('!mode ' + mode.id, other);
  expect(a.set).toHaveBeenLastCalledWith(123, true);
  expect(() => s.setControlUsers(id, ['bad'])).toThrow('17 siffror');
});
it('tvetydiga namn kräver ID och borttagna teammedlemmar får inte styra', async () => {
  const { s, a, id, send } = await setup();
  await s.addDevice({ name: 'Ljus', entityId: 1 });
  await s.addDevice({ name: 'Ljus', entityId: 2 });
  await send('!switch Ljus on');
  expect(a.set).not.toHaveBeenCalled();
  expect(a.chat.mock.lastCall![0]).toContain('unikt');
  await send('!switch 2 on');
  expect(a.set).toHaveBeenLastCalledWith(2, true);
  s.setControlUsers(id, [other]);
  a.members = a.members.filter((m) => m.steamId !== other);
  a.set.mockClear();
  await send('!switch 1 on', other);
  expect(a.set).not.toHaveBeenCalled();
});
it('ledarskap läses färskt, serverbekräftas och använder bara aktuell parning', async () => {
  const { s, a, id, send } = await setup();
  s.setControlUsers(id, [other]);
  await send('!makeleader', other);
  expect(a.promote).toHaveBeenCalledWith(other);
  expect(a.chat).toHaveBeenLastCalledWith('[ElRusty] Du är nu teamledare.');
  await send('!makeleader', other);
  expect(a.promote).toHaveBeenCalledTimes(1);
  expect(a.chat.mock.lastCall![0]).toContain('redan');
  await send('!makeleader', owner);
  expect(a.promote).toHaveBeenCalledTimes(1);
  expect(a.chat.mock.lastCall![0]).toContain('parade kontot måste');
});
it('nekat eller obekräftat ledarskapsbyte ger aldrig ett framgångssvar', async () => {
  const { s, a, id, send } = await setup();
  s.setControlUsers(id, [other]);
  a.promote.mockImplementation(async () => {});
  await send('!makeleader', other);
  expect(a.chat.mock.lastCall![0]).toContain('bekräftade inte');
  a.promote.mockRejectedValue(Error('secret'));
  await send('!makeleader', other);
  expect(a.chat.mock.lastCall![0]).toContain('kunde inte utföras');
  expect(JSON.stringify(a.chat.mock.calls)).not.toContain('secret');
});
it('nya mänskliga meddelanden vidarebefordras en gång inklusive parade kontot; ekon ignoreras', async () => {
  const { s, a } = await setup(),
    listen = vi.fn();
  s.on('teamChat', listen);
  const m = { steamId: owner, message: 'Hej @everyone', time: 1 };
  await s.onChat(m);
  await s.onChat(m);
  expect(listen).toHaveBeenCalledOnce();
  expect(listen.mock.calls[0][0].text).toBe('Hej ＠everyone');
  await s.onChat({ ...m, time: 2, message: '[Discord] Test: hello' });
  await s.onChat({ ...m, time: 3, message: '[ElRusty] Speltid: 12:00' });
  expect(listen).toHaveBeenCalledOnce();
  expect(a.chat).not.toHaveBeenCalled();
});
it('Discord→Rust begränsar text, tömmer väntande kö vid avbrott och återspelar inte', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  s.config.discord.relayEnabled = true;
  s.relayFromDiscord('Discord User', 'Hej @everyone ' + '😀'.repeat(200));
  s.relayFromDiscord('User', 'stale');
  await flush();
  expect(a.chat).toHaveBeenCalledOnce();
  expect([...a.chat.mock.calls[0][0]].length).toBeLessThanOrEqual(120);
  expect(a.chat.mock.calls[0][0]).not.toContain('@everyone');
  a.emit('lost');
  await vi.advanceTimersByTimeAsync(2000);
  expect(a.chat).toHaveBeenCalledOnce();
});
it('begränsad textkö släpper överflöd och ogiltiga jobb samt kan avbrytas under pågående sändning', async () => {
  vi.useFakeTimers();
  const q = new TextQueue(1000, 2),
    send = vi.fn(async (_s: string) => {});
  expect(q.push('one', send, () => true)).toBe(true);
  expect(q.push('two', send, () => false)).toBe(true);
  expect(q.push('overflow', send, () => true)).toBe(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(send).toHaveBeenCalledTimes(1);
  q.clear();
  expect(plainText('Hi <@123> @here\n ok')).toBe('Hi ＠here ok');
});

function fakeClient(deny = false) {
  const c: any = new EventEmitter();
  c.user = { id: 'bot' };
  c.isReady = () => true;
  c.destroy = vi.fn(async () => {});
  c.guilds = { fetch: vi.fn(async () => ({ commands: { set: vi.fn(async () => {}) } })) };
  c.channels = { fetch: vi.fn(async () => null) };
  c.login = vi.fn(async () => {
    if (deny) {
      c.emit('shardDisconnect', { code: 4014 });
      throw Object.assign(Error('denied'), { code: 'DisallowedIntents' });
    }
  });
  return c;
}
it('saknat Message Content Intent pausar bara chatt och startar om övrig bot utan privilegierat intent', async () => {
  const { s } = await setup();
  s.config.discord = {
    guildId: 'g',
    channelId: '',
    token: 'secret',
    userIds: ['u'],
    roleIds: [],
    relayEnabled: true,
  };
  const clients = [fakeClient(true), fakeClient()],
    factory = vi.fn((_intents: number[]) => clients.shift()!);
  const bot = new DiscordBot(s, factory);
  await bot.start();
  expect(factory).toHaveBeenCalledTimes(2);
  expect(factory.mock.calls[1][0]).toEqual([1]);
  expect(s.discordStatus).toBe('Ansluten');
  expect(s.relayError).toContain('Message Content Intent');
  expect(s.config.discord.enabled).toBe(true);
  await bot.close();
});
it('Discord-chatt kräver rätt kanal och användare/roll, deduplicerar och ignorerar bots/webhooks', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  s.config.discord = {
    guildId: 'g',
    channelId: '',
    token: 'secret',
    userIds: ['u'],
    roleIds: ['role'],
    relayEnabled: true,
    categoryId: 'cat',
    channels: { teamchat: 'chat' },
  };
  s.config.discord.setupAccessKey = discordAccessKey(s.config.discord);
  const client = fakeClient(),
    bot = new DiscordBot(s, () => client);
  await bot.start();
  const m: any = {
    id: '1',
    createdTimestamp: Date.now() + 1,
    guildId: 'g',
    channelId: 'chat',
    author: { id: 'u', username: 'User' },
    content: 'hello',
    member: { displayName: 'User', roles: { cache: new Map() } },
  };
  await bot.handleTeamChat(m);
  await bot.handleTeamChat(m);
  await flush();
  expect(a.chat).toHaveBeenCalledOnce();
  for (const extra of [
    { id: '2', guildId: 'other' },
    { id: '3', author: { id: 'stranger' } },
    { id: '4', author: { id: 'u', bot: true } },
    { id: '5', webhookId: 'w' },
    { id: '6', channelId: 'other' },
    { id: 'old', createdTimestamp: 0 },
  ])
    await bot.handleTeamChat({ ...m, ...extra });
  await vi.advanceTimersByTimeAsync(1000);
  expect(a.chat).toHaveBeenCalledOnce();
  await bot.handleTeamChat({
    ...m,
    id: '7',
    author: { id: 'friend', username: 'Friend' },
    member: { roles: { cache: new Map([['role', {}]]) } },
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(a.chat).toHaveBeenCalledTimes(2);
  await bot.close();
});
