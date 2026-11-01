import type { LiveService } from './service.ts';
import type { ChatMessage } from './rust.ts';
import { insist } from './validation.ts';
import { gridLocation } from '../shared/world.ts';
import { teamCommands } from '../shared/commands.ts';
import { unique } from './chat.ts';
export function duration(ms: number) {
  insist(Number.isFinite(ms) && ms >= 0, 'Tidsuppgift saknas.');
  const s = Math.floor(ms / 1000),
    m = Math.floor(s / 60),
    h = Math.floor(m / 60),
    d = Math.floor(h / 24);
  if (d) return `${d} d ${h % 24} h`;
  if (h) return `${h} h ${m % 60} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}
export const readCommands = new Set([
  'wipe',
  'uptime',
  'online',
  'offline',
  'alive',
  'steamid',
  'prox',
  'death',
]);
export function helpReply(query: string) {
  const key = query.trim().replace(/^!/, '').toLowerCase();
  if (!key)
    return (
      teamCommands.map((c) => '!' + c.name).join(' · ') +
      ' · Hjälp: !help <kommando> eller !help server/team/styrning'
    );
  const command = teamCommands.find((c) => c.name === key);
  if (command) return command.syntax + ' — ' + command.description;
  const group = teamCommands.filter((c) => c.group === key);
  insist(group.length, 'Okänt kommando eller grupp. Skriv !help.');
  return group.map((c) => c.syntax).join(' · ');
}
export async function readReply(
  service: LiveService,
  message: ChatMessage,
  command: string,
  arg: string,
) {
  const { now, serviceStartedAt, connectedAt } = service.timing();
  const member = (value = arg || message.steamId) =>
    unique(
      service.team.map((m) => ({ ...m, id: m.steamId })),
      value,
    );
  switch (command) {
    case 'wipe': {
      const info = await service.world?.refreshInfo();
      insist(
        info && Number.isFinite(info.wipeTime) && info.wipeTime > 0 && info.wipeTime * 1000 <= now,
        'Servern skickade ingen giltig wipe-tid.',
      );
      return 'Sedan senaste wipe: ' + duration(now - info.wipeTime * 1000) + '.';
    }
    case 'uptime':
      return `ElRusty: ${duration(now - serviceStartedAt)} · Rust+-anslutning: ${connectedAt === null ? 'ej ansluten' : duration(now - connectedAt)}.`;
    case 'online':
    case 'offline': {
      const list = service.team.filter((m) => m.isOnline === (command === 'online'));
      return `${list.length} ${command}: ${list.map((m) => m.name).join(', ') || 'inga'}.`;
    }
    case 'steamid': {
      const m = member();
      return `${m.name}: ${m.steamId}`;
    }
    case 'alive': {
      const eligible = service.team.filter(
        (m) => m.isAlive && m.spawnTime && m.spawnTime > 0 && m.spawnTime * 1000 <= now,
      );
      if (arg) {
        const m = member();
        if (!m.isAlive) return m.name + ' är död.';
        insist(
          eligible.some((e) => e.steamId === m.steamId),
          'Tillförlitlig spawn-tid saknas för ' + m.name + '.',
        );
        return `${m.name} har levt i ${duration(now - m.spawnTime! * 1000)}.`;
      }
      const oldest = eligible.sort((a, b) => a.spawnTime! - b.spawnTime!)[0];
      insist(oldest, 'Ingen tillförlitlig spawn-tid i teaminformationen.');
      return `Lever längst: ${oldest.name} · ${duration(now - oldest.spawnTime! * 1000)}.`;
    }
    case 'prox': {
      const me = member(message.steamId);
      insist(
        me.isAlive && me.isOnline && Number.isFinite(me.x) && Number.isFinite(me.y),
        'Din aktuella position saknas.',
      );
      const others = service.team
        .filter(
          (m) =>
            m.steamId !== me.steamId &&
            m.isAlive &&
            m.isOnline &&
            Number.isFinite(m.x) &&
            Number.isFinite(m.y),
        )
        .map((m) => ({ name: m.name, distance: Math.hypot(m.x! - me.x!, m.y! - me.y!) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      return others.length
        ? 'Närmaste på kartan: ' +
            others.map((m) => `${m.name} ${Math.round(m.distance)} m`).join(' · ') +
            '.'
        : 'Inga andra levande lagkamrater online med känd position.';
    }
    case 'death': {
      const m = member(),
        owner = service.config.profiles.find(
          (p) => p.id === service.config.activeProfileId,
        )?.playerId;
      insist(
        m.steamId === owner,
        'Ingen sparad dödsplats för ' + m.name + '. Platser sparas för det parade kontot.',
      );
      const death = service.lastDeath,
        size = service.world?.snapshot().info?.mapSize;
      insist(death && size, 'Ingen sparad dödsplats för ' + m.name + '.');
      const age = death.at && death.at <= now ? ' · ' + duration(now - death.at) + ' sedan' : '';
      return `${m.name}, senaste dödsplats: ${gridLocation(death.x, death.y, size)}${death.approximate ? ' (ungefärlig)' : ''}${age}.`;
    }
    default:
      throw Error('Unknown read command');
  }
}
