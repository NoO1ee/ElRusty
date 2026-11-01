import { expect, it, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { discordSetupPreview, provisionDiscord, managedAccessValid } from '../server/discord-setup';
import type { Config } from '../server/db';
function fixture() {
  const config: Config['discord'] = {
    guildId: 'g',
    channelId: '',
    userIds: ['owner'],
    roleIds: ['team'],
    token: 'secret',
  };
  const all = new Map<string, any>();
  let n = 0;
  const create = vi.fn(async (options: any) => {
    const c = {
      id: String(++n),
      guildId: 'g',
      type: options.type,
      name: options.name,
      parentId: options.parent,
      permissionOverwrites: { set: vi.fn(async () => {}) },
      setParent: vi.fn(async (id: string) => {
        c.parentId = id;
      }),
    };
    all.set(c.id, c);
    return c;
  });
  const guild = {
    id: 'g',
    name: 'Guild',
    members: {
      me: { permissions: { has: vi.fn(() => true) } },
      fetch: vi.fn(async (id: string) => ({ id })),
    },
    roles: { fetch: vi.fn(async (id: string) => ({ id })) },
    channels: { create, fetch: vi.fn(async (id: string) => all.get(id) || null) },
  };
  return { config, all, guild, create };
}
it('förhandsvisning beskriver åtkomst utan att skapa resurser', async () => {
  const { guild, config, create } = fixture();
  expect(await discordSetupPreview(guild, 'bot', config)).toMatchObject({
    category: 'ElRusty',
    botId: 'bot',
    channels: ['status', 'larm', 'events', 'aktivitet', 'styrning', 'teamchat'],
  });
  expect(create).not.toHaveBeenCalled();
});
it('skapar privata kanaler och återkörning använder samma ID:n', async () => {
  const { guild, config, create, all } = fixture(),
    save = vi.fn();
  await provisionDiscord(guild, 'bot', config, save);
  expect(create).toHaveBeenCalledTimes(7);
  expect(managedAccessValid(config)).toBe(true);
  const ids = { ...config.channels };
  await provisionDiscord(guild, 'bot', config, save);
  expect(create).toHaveBeenCalledTimes(7);
  expect(config.channels).toEqual(ids);
  const access = all.get(config.categoryId!).permissionOverwrites.set.mock.calls[0][0];
  expect(access).toContainEqual({ id: 'g', type: 0, deny: [P.ViewChannel] });
  expect(access).toContainEqual({
    id: 'owner',
    type: 1,
    allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory],
  });
});
it('fortsätter efter delvis fel utan att skapa redan sparade kanaler igen', async () => {
  const { guild, config, create } = fixture();
  const original = create.getMockImplementation()!;
  create.mockImplementation(async (options: any) => {
    if (create.mock.calls.length === 4) throw Error('API unavailable');
    return original(options);
  });
  const save = vi.fn();
  await expect(provisionDiscord(guild, 'bot', config, save)).rejects.toThrow();
  expect(config.categoryId).toBeDefined();
  expect(Object.keys(config.channels!)).toHaveLength(2);
  create.mockImplementation(original);
  await provisionDiscord(guild, 'bot', config, save);
  expect(Object.keys(config.channels!)).toHaveLength(6);
  expect(create).toHaveBeenCalledTimes(8);
});
it('nekar saknade rättigheter och publik @everyone-åtkomst innan skapande', async () => {
  const { guild, config, create } = fixture();
  guild.members.me.permissions.has.mockReturnValue(false);
  await expect(provisionDiscord(guild, 'bot', config, vi.fn())).rejects.toThrow('Manage Channels');
  expect(create).not.toHaveBeenCalled();
  guild.members.me.permissions.has.mockReturnValue(true);
  config.roleIds = ['g'];
  await expect(provisionDiscord(guild, 'bot', config, vi.fn())).rejects.toThrow('@everyone');
});
it('tar inte över oregistrerade kanaler med samma namn', async () => {
  const { guild, config, all } = fixture();
  all.set('legacy', { id: 'legacy', guildId: 'g', type: ChannelType.GuildText, name: 'status' });
  await provisionDiscord(guild, 'bot', config, vi.fn());
  expect(config.channels!.status).not.toBe('legacy');
  expect(all.has('legacy')).toBe(true);
});
it('ändrad åtkomst spärrar nya leveranser tills kanalsetup har applicerats', async () => {
  const { guild, config } = fixture();
  await provisionDiscord(guild, 'bot', config, vi.fn());
  config.userIds = [];
  expect(managedAccessValid(config)).toBe(false);
  await provisionDiscord(guild, 'bot', config, vi.fn());
  expect(managedAccessValid(config)).toBe(true);
});

it('återskapar raderad kategori och kanaler med färska hämtningar', async () => {
  const { guild, config, all, create } = fixture();
  await provisionDiscord(guild, 'bot', config, vi.fn());
  const oldCategory = config.categoryId;
  config.statusMessageId = 'deleted-status-message';
  config.instructionsMessageId = 'deleted-instructions-message';
  all.clear();
  guild.channels.fetch.mockImplementation(async () => {
    throw Object.assign(new Error('private payload'), { code: 10003 });
  });
  await provisionDiscord(guild, 'bot', config, vi.fn());
  expect(create).toHaveBeenCalledTimes(14);
  expect(config.categoryId).not.toBe(oldCategory);
  expect(config.statusMessageId).toBeUndefined();
  expect(config.instructionsMessageId).toBeUndefined();
  expect(
    guild.channels.fetch.mock.calls.every(
      (call) => (call as unknown[])[1] && ((call as unknown[])[1] as any).force,
    ),
  ).toBe(true);
});
it('ersätter bara saknade kanaler och behåller kategori och befintliga kanaler', async () => {
  const { guild, config, all, create } = fixture();
  await provisionDiscord(guild, 'bot', config, vi.fn());
  const category = config.categoryId,
    status = config.channels!.status,
    alarm = config.channels!.larm;
  all.delete(status!);
  await provisionDiscord(guild, 'bot', config, vi.fn());
  expect(create).toHaveBeenCalledTimes(8);
  expect(config.categoryId).toBe(category);
  expect(config.channels!.status).not.toBe(status);
  expect(config.channels!.larm).toBe(alarm);
});
it('visar begripligt fel för saknade medlemmar och roller utan att ändra åtkomst', async () => {
  const { guild, config, create } = fixture();
  guild.members.fetch.mockRejectedValue(
    Object.assign(new Error('private payload'), { code: 10007 }),
  );
  await expect(discordSetupPreview(guild, 'bot', config)).rejects.toThrow(
    'Discord-användaren owner finns inte',
  );
  expect(config.userIds).toEqual(['owner']);
  guild.members.fetch.mockResolvedValue({ id: 'owner' });
  guild.roles.fetch.mockRejectedValue(Object.assign(new Error('private payload'), { code: 10011 }));
  await expect(discordSetupPreview(guild, 'bot', config)).rejects.toThrow(
    'Discord-rollen team finns inte',
  );
  expect(create).not.toHaveBeenCalled();
});
it('tolkar inte åtkomstfel på kanaler som raderade kanaler', async () => {
  const { guild, config, create } = fixture();
  await provisionDiscord(guild, 'bot', config, vi.fn());
  guild.channels.fetch.mockRejectedValue(Object.assign(new Error('denied'), { code: 50013 }));
  await expect(provisionDiscord(guild, 'bot', config, vi.fn())).rejects.toThrow('denied');
  expect(create).toHaveBeenCalledTimes(7);
});
