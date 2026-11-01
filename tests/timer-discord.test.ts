import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { DiscordBot } from '../server/discord';
import { discordAccessKey } from '../server/discord-setup';
const clean: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const a = Object.assign(new EventEmitter(), {
    open: async () => {},
    close: () => {},
    info: async () => {},
    team: async () => [],
    entity: async () => ({ type: 'switch' as const, value: false }),
    set: async () => {},
    time: async () => 12,
    chat: vi.fn(async (_s: string) => {}),
  });
  const db = new LiveDB(':memory:'),
    s = new LiveService(db, () => a);
  clean.push(() => db.close());
  clean.push(() => s.close());
  const id = s.saveProfile({
    name: 'Server @everyone',
    host: 'localhost',
    port: 1,
    playerId: '76561198000000000',
    playerToken: 1,
  });
  s.connect(id);
  await flush();
  s.config.discord = {
    guildId: 'g',
    categoryId: 'cat',
    channels: { events: 'events' },
    channelId: '',
    userIds: ['owner'],
    roleIds: [],
    token: 'secret',
    relayEnabled: false,
  };
  s.config.discord.setupAccessKey = discordAccessKey(s.config.discord);
  let ready = true;
  const channel = {
    guildId: 'g',
    isSendable: () => true,
    send: vi.fn(async (_value: any) => ({ id: 'sent' })),
  };
  const client: any = new EventEmitter();
  client.user = { id: 'bot' };
  client.isReady = () => ready;
  client.login = vi.fn(async () => {});
  client.destroy = vi.fn(async () => {
    ready = false;
  });
  client.guilds = { fetch: vi.fn(async () => ({ commands: { set: async () => {} } })) };
  client.channels = { fetch: vi.fn(async () => channel) };
  const factory = vi.fn((_intents: number[]) => client),
    bot = new DiscordBot(s, factory);
  clean.push(() => bot.close());
  await bot.start();
  ready = true;
  return {
    s,
    a,
    db,
    bot,
    client,
    channel,
    factory,
    add: () => s.timers.create({ name: 'Oil @everyone', duration: '10s' }),
  };
}
it('timer går till registrerad privat #events utan tvåvägschatt eller Message Content Intent', async () => {
  const { s, channel, factory, add } = await fixture();
  add();
  await vi.advanceTimersByTimeAsync(10000);
  expect(factory.mock.calls[0][0]).toEqual([1]);
  expect(channel.send).toHaveBeenCalledOnce();
  expect(channel.send.mock.calls[0][0]).toMatchObject({ allowedMentions: { parse: [] } });
  expect(channel.send.mock.calls[0][0].content).toContain('Server ＠everyone');
  expect(channel.send.mock.calls[0][0].content).not.toContain('@everyone');
  expect(s.snapshot().timers![0].discord).toBe('sent');
  expect(s.config.discord.relayEnabled).toBe(false);
});
it('ändrad åtkomst stoppar nya aviseringar tills privat setup är uppdaterad', async () => {
  const { s, channel, add } = await fixture();
  add();
  s.config.discord.roleIds = ['new-role'];
  await vi.advanceTimersByTimeAsync(10000);
  expect(channel.send).not.toHaveBeenCalled();
  expect(s.snapshot().timers![0].discord).toBe('missed');
});
it('fel kanal eller behörighetsfel markeras obekräftat medan Rust fortfarande fungerar', async () => {
  const { s, a, channel, add } = await fixture();
  channel.guildId = 'other';
  add();
  await vi.advanceTimersByTimeAsync(10000);
  expect(channel.send).not.toHaveBeenCalled();
  expect(a.chat).toHaveBeenCalledOnce();
  expect(s.snapshot().timers![0]).toMatchObject({ rust: 'sent', discord: 'unconfirmed' });
});
it('stop under kanalhämtning och väntande kö ger inga senare Discord-meddelanden', async () => {
  const { s, bot, client, channel, add } = await fixture();
  let release!: (c: typeof channel) => void;
  client.channels.fetch.mockImplementationOnce(() => new Promise((r) => (release = r)));
  add();
  add();
  await vi.advanceTimersByTimeAsync(10000);
  await bot.stop();
  release(channel);
  await flush();
  await vi.advanceTimersByTimeAsync(3000);
  expect(channel.send).not.toHaveBeenCalled();
  expect(s.snapshot().timers!.every((t) => t.discord === 'missed')).toBe(true);
});

it('Rust-avbrott stoppar inte en redan köad Discord-avisering för samma profil', async () => {
  const { a, channel, add } = await fixture();
  add();
  add();
  await vi.advanceTimersByTimeAsync(10000);
  expect(channel.send).toHaveBeenCalledOnce();
  a.emit('lost');
  await vi.advanceTimersByTimeAsync(1000);
  expect(channel.send).toHaveBeenCalledTimes(2);
});
