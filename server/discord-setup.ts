import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import type { Config } from './db.ts';
import { insist } from './validation.ts';
export const discordChannelNames = [
  'status',
  'larm',
  'events',
  'aktivitet',
  'styrning',
  'teamchat',
] as const;
export type ManagedChannel = (typeof discordChannelNames)[number];
export function discordAccessKey(config: Config['discord']) {
  return JSON.stringify([config.guildId, [...config.userIds].sort(), [...config.roleIds].sort()]);
}
export function managedAccessValid(config: Config['discord']) {
  return !config.categoryId || config.setupAccessKey === discordAccessKey(config);
}
export async function discordSetupPreview(guild: any, botId: string, config: Config['discord']) {
  insist(guild.id === config.guildId, 'Välj rätt Discord-server.');
  insist(
    config.userIds.length + config.roleIds.length > 0,
    'Lägg till minst en tillåten användare eller roll först.',
  );
  insist(
    !config.roleIds.includes(guild.id),
    '@everyone kan inte få åtkomst till den privata kategorin.',
  );
  const me = guild.members.me || (await guild.members.fetchMe());
  const required = [
    P.ManageChannels,
    P.ManageRoles,
    P.ViewChannel,
    P.SendMessages,
    P.ReadMessageHistory,
    P.EmbedLinks,
  ];
  insist(
    required.every((p) => me.permissions.has(p)),
    'Boten behöver Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History och Embed Links.',
  );
  for (const id of config.roleIds)
    insist(await guild.roles.fetch(id), 'En tillåten roll finns inte i servern.');
  for (const id of config.userIds)
    insist(await guild.members.fetch(id), 'En tillåten användare finns inte i servern.');
  return {
    guildId: guild.id,
    guildName: guild.name,
    botId,
    category: 'ElRusty',
    channels: [...discordChannelNames],
    userIds: config.userIds,
    roleIds: config.roleIds,
  };
}
export async function provisionDiscord(
  guild: any,
  botId: string,
  config: Config['discord'],
  save: () => void,
) {
  await discordSetupPreview(guild, botId, config);
  const access = [
    { id: guild.id, type: 0, deny: [P.ViewChannel] },
    {
      id: botId,
      type: 1,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks],
    },
    ...config.userIds
      .filter((id) => id !== botId)
      .map((id) => ({ id, type: 1, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
    ...config.roleIds.map((id) => ({
      id,
      type: 0,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory],
    })),
  ];
  async function existing(id?: string) {
    if (!id) return null;
    try {
      return await guild.channels.fetch(id);
    } catch (e) {
      if ((e as { code?: number }).code === 10003) return null;
      throw e;
    }
  }
  let category = await existing(config.categoryId);
  if (category)
    insist(
      category.guildId === guild.id && category.type === ChannelType.GuildCategory,
      'Den sparade kategorin har fel typ eller server.',
    );
  else {
    category = await guild.channels.create({
      name: 'ElRusty',
      type: ChannelType.GuildCategory,
      permissionOverwrites: access,
      reason: 'ElRusty guidad setup',
    });
    config.categoryId = category.id;
    save();
  }
  await category.permissionOverwrites.set(access);
  config.channels ||= {};
  for (const key of discordChannelNames) {
    let channel = await existing(config.channels[key]);
    if (channel)
      insist(
        channel.guildId === guild.id && channel.type === ChannelType.GuildText,
        'En sparad kanal har fel typ eller server.',
      );
    else {
      channel = await guild.channels.create({
        name: key,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: access,
        topic: 'ElRusty · ' + key,
        reason: 'ElRusty guidad setup',
      });
      config.channels[key] = channel.id;
      save();
    }
    if (channel.parentId !== category.id)
      await channel.setParent(category.id, { lockPermissions: false });
    await channel.permissionOverwrites.set(access);
  }
  config.botId = botId;
  config.channelId = config.channels.larm!;
  config.setupAccessKey = discordAccessKey(config);
  save();
  return { categoryId: category.id, channels: config.channels };
}
