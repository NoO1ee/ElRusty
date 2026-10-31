import { isIP } from 'node:net';
import type { Config, PrivateProfile } from './db.ts';
import type { Device, Mode, DiscordConfig } from '../shared/live.ts';
export class UserError extends Error {}
export function insist(test: unknown, message: string): asserts test {
  if (!test) throw new UserError(message);
}
export function object(value: unknown): Record<string, unknown> {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'Ogiltiga uppgifter.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 100): string {
  insist(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.trim().length <= max &&
      !/[\u0000-\u001f]/.test(value),
    'Ange en giltig text.',
  );
  return value.trim();
}
export function profile(value: unknown, previous?: PrivateProfile): PrivateProfile {
  const b = object(value),
    host = text(b.host, 253),
    playerId = text(b.playerId, 20);
  insist(
    isIP(host) || /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host),
    'Ogiltig serveradress.',
  );
  insist(/^\d{17}$/.test(playerId), 'Ange SteamID64 som 17 siffror.');
  insist(
    Number.isInteger(b.port) && Number(b.port) > 0 && Number(b.port) <= 65535,
    'Ogiltig app.port.',
  );
  const token =
    b.playerToken === '' || b.playerToken === undefined ? previous?.playerToken : b.playerToken;
  insist(
    Number.isInteger(token) && Number(token) >= -2147483648 && Number(token) <= 2147483647,
    'PlayerToken måste vara ett giltigt int32-tal.',
  );
  insist(b.useProxy === undefined || typeof b.useProxy === 'boolean', 'Ogiltigt proxyval.');
  return {
    id: previous?.id || crypto.randomUUID(),
    name: text(b.name),
    host,
    port: Number(b.port),
    playerId,
    playerToken: Number(token),
    useProxy: b.useProxy === true,
  };
}
export function device(value: unknown, profileId: string): Omit<Device, 'type'> {
  const b = object(value);
  insist(
    Number.isInteger(b.entityId) && Number(b.entityId) > 0 && Number(b.entityId) <= 4294967295,
    'Entity-ID måste vara ett positivt uint32-tal.',
  );
  return {
    id: crypto.randomUUID(),
    profileId,
    entityId: Number(b.entityId),
    name: text(b.name),
    group: b.group ? text(b.group, 60) : '',
  };
}
export function mode(value: unknown, config: Config, profileId: string): Mode {
  const b = object(value);
  insist(
    Array.isArray(b.values) && b.values.length > 0 && b.values.length <= 100,
    'Välj minst en switch.',
  );
  const values = b.values.map((raw) => {
    const v = object(raw);
    insist(
      typeof v.deviceId === 'string' &&
        typeof v.value === 'boolean' &&
        config.devices.some(
          (d) => d.id === v.deviceId && d.profileId === profileId && d.type === 'switch',
        ),
      'Läget innehåller en ogiltig switch.',
    );
    return { deviceId: v.deviceId as string, value: v.value as boolean };
  });
  insist(
    new Set(values.map((v) => v.deviceId)).size === values.length,
    'En switch får bara förekomma en gång.',
  );
  return { id: crypto.randomUUID(), profileId, name: text(b.name), values };
}
export function discord(value: unknown, old: Config['discord']): Config['discord'] {
  const b = object(value),
    snow = (v: unknown) => {
      const id = text(v, 20);
      insist(/^\d{17,20}$/.test(id), 'Ogiltigt Discord-ID.');
      return id;
    };
  const ids = (v: unknown) => {
    insist(Array.isArray(v) && v.length <= 100, 'Ogiltig behörighetslista.');
    return [...new Set(v.map(snow))];
  };
  return {
    ...(b.guildId === old.guildId
      ? {
          setupAccessKey: old.setupAccessKey,
          categoryId: old.categoryId,
          channels: old.channels,
          botId: old.botId,
          statusMessageId: old.statusMessageId,
          instructionsMessageId: old.instructionsMessageId,
          relayEnabled: old.relayEnabled,
        }
      : {}),
    guildId: b.guildId ? snow(b.guildId) : '',
    channelId: b.channelId ? snow(b.channelId) : '',
    userIds: ids(b.userIds),
    roleIds: ids(b.roleIds),
    token: b.token ? text(b.token, 250) : old.token,
  } satisfies DiscordConfig & { token: string };
}
