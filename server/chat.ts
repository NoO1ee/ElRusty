import { readCommands, readReply, helpReply } from './read-commands.ts';
import { teamCommands } from '../shared/commands.ts';
import type { LiveService } from './service.ts';
import type { ChatMessage } from './rust.ts';
import { eventNames, gridLocation } from '../shared/world.ts';
import { insist, UserError } from './validation.ts';

export function plainText(value: string, max = 120) {
  return [
    ...value
      .replace(/<[@#][!&]?\d+>/g, '')
      .replace(/<\/?(?:color|size|b|i)(?:=[^>]*)?>/gi, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/@/g, '＠')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, max)
    .join('');
}
export function unique<T extends { id: string; name: string }>(items: T[], query: string) {
  const exact = items.find((i) => i.id === query);
  if (exact) return exact;
  const matches = items.filter((i) => i.name.toLowerCase() === query.toLowerCase());
  insist(matches.length === 1, 'Ange ett unikt namn eller ID.');
  return matches[0];
}
const known = new Set<string>(teamCommands.map((c) => c.name));
export function commandName(text: string) {
  return /^!(\w+)(?:\s|$)/.exec(text.trim().toLowerCase())?.[1] || '';
}
export async function commandReply(service: LiveService, message: ChatMessage, gen: number) {
  const text = message.message.trim(),
    command = commandName(text),
    arg = text.slice(command.length + 1).trim();
  const { adapter, profileId } = service.liveSession();
  const profile = service.config.profiles.find((p) => p.id === profileId)!;
  insist(
    service.teamUpdatedAt !== null && service.team.some((m) => m.steamId === message.steamId),
    'Du finns inte i det aktuella teamet.',
  );
  if (['switch', 'group', 'mode', 'makeleader'].includes(command))
    insist(
      message.steamId === profile.playerId || profile.controlSteamIds?.includes(message.steamId),
      'Du saknar behörighet för styrkommandon.',
    );
  if (['switch', 'group', 'mode'].includes(command)) {
    const fresh = await adapter.team();
    service.assertSession(gen);
    insist(
      fresh.some((m) => m.steamId === message.steamId),
      'Spelaren finns inte i teamet.',
    );
  }
  if (command === 'timer' || command === 'timers')
    return service.timers.command(command, arg, {
      steamId: message.steamId,
      name: service.team.find((m) => m.steamId === message.steamId)!.name,
    });
  if (readCommands.has(command)) return readReply(service, message, command, arg);
  switch (command) {
    case 'time':
      return service.clock.reply();
    case 'help':
      return helpReply(arg);
    case 'pop': {
      const info = await service.world?.refreshInfo();
      insist(info, 'Serverinformation saknas.');
      return `Spelare: ${info.players}/${info.maxPlayers}${info.queuedPlayers === undefined ? '' : ' · Kö: ' + info.queuedPlayers}`;
    }
    case 'where': {
      const member = unique(
        service.team.map((m) => ({ ...m, id: m.steamId })),
        arg || message.steamId,
      );
      const size = service.world?.snapshot().info?.mapSize;
      insist(size && member.x !== undefined && member.y !== undefined, 'Position saknas.');
      return `${member.name}: ${gridLocation(member.x, member.y, size)}`;
    }
    case 'events': {
      const world = service.world?.snapshot();
      insist(world?.updatedAt && !world.error, 'Aktuell eventinformation saknas.');
      return (
        world.markers
          .filter((m) => eventNames[m.type])
          .map((m) => `${eventNames[m.type]} ${gridLocation(m.x, m.y, world.info!.mapSize)}`)
          .join(' · ') ||
        'Inga eventdata från Rust+. Det säger inte om event pågår; vanilla skickar inte längre sådana markörer.'
      );
    }
    case 'makeleader':
      return service.promoteCaller(message.steamId, gen);
    case 'switch':
    case 'group':
    case 'mode': {
      let results;
      const state = service.snapshot();
      if (command === 'mode') results = await service.runMode(unique(state.modes, arg).id);
      else {
        const match = /^(.*?)\s+(on|off)$/i.exec(arg);
        insist(match, `Syntax: !${command} <namn/ID> on/off`);
        const name = match[1].trim(),
          value = match[2].toLowerCase() === 'on';
        if (command === 'switch') {
          const d = unique(
            state.devices
              .filter((d) => d.type === 'switch')
              .map((d) => ({ ...d, id: String(d.entityId) === name ? name : d.id })),
            name,
          );
          const actual = state.devices.find((x) => x.entityId === d.entityId)!;
          results = await service.run([{ deviceId: actual.id, value }]);
        } else {
          const groups = [
            ...new Set(
              state.devices.filter((d) => d.type === 'switch' && d.group).map((d) => d.group),
            ),
          ];
          results = await service.runGroup(
            unique(
              groups.map((g) => ({ id: g, name: g })),
              name,
            ).name,
            value,
          );
        }
      }
      service.assertSession(gen);
      return results
        .map((r) => `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ': kunde inte bekräftas'}`)
        .join(' · ');
    }
    default:
      return '';
  }
}
export function isKnownCommand(text: string) {
  return known.has(commandName(text));
}
export function publicChatError(e: unknown) {
  return e instanceof UserError ? e.message : 'Kommandot kunde inte utföras.';
}

/** Bounded, paced, cancellable queue. Reconnect never replays old entries. */
export class TextQueue {
  private items: { text: string; send: (text: string) => Promise<void>; valid: () => boolean }[] =
    [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private busy = false;
  constructor(
    private delay = 1000,
    private limit = 20,
  ) {}
  push(text: string, send: (text: string) => Promise<void>, valid: () => boolean) {
    if (this.items.length + (this.busy ? 1 : 0) >= this.limit) return false;
    this.items.push({ text, send, valid });
    if (!this.busy && !this.timer) void this.next(this.generation);
    return true;
  }
  clear() {
    this.generation++;
    this.items = [];
    clearTimeout(this.timer);
    this.timer = undefined;
    this.busy = false;
  }
  private async next(gen: number) {
    if (gen !== this.generation) return;
    this.timer = undefined;
    const item = this.items.shift();
    if (!item) return;
    this.busy = true;
    try {
      if (item.valid()) await item.send(item.text);
    } catch {
      /* Never retry chat. */
    } finally {
      if (gen === this.generation) {
        this.busy = false;
        this.timer = setTimeout(() => void this.next(gen), this.delay);
      }
    }
  }
}
