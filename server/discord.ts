import { Client, GatewayIntentBits, SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { Activity, CommandResult, DiscordConfig } from '../shared/live.ts';
import type { LiveService } from './service.ts';
import { insist } from './validation.ts';
export function authorized(
  config: DiscordConfig,
  guildId: string | null,
  userId: string,
  roles: string[],
) {
  return (
    guildId === config.guildId &&
    (config.userIds.includes(userId) || roles.some((r) => config.roleIds.includes(r)))
  );
}
export const commands = [
  new SlashCommandBuilder().setName('status').setDescription('Visa ElRustys anslutningsstatus'),
  new SlashCommandBuilder().setName('team').setDescription('Visa Rust-teamets status'),
  new SlashCommandBuilder()
    .setName('switch')
    .setDescription('Styr en Smart Switch')
    .addStringOption((o) =>
      o.setName('enhet').setDescription('Enhetens namn eller ElRusty-ID').setRequired(true),
    )
    .addBooleanOption((o) => o.setName('pa').setDescription('På eller av').setRequired(true)),
  new SlashCommandBuilder()
    .setName('group')
    .setDescription('Styr en switchgrupp')
    .addStringOption((o) => o.setName('namn').setDescription('Gruppens namn').setRequired(true))
    .addBooleanOption((o) => o.setName('pa').setDescription('På eller av').setRequired(true)),
  new SlashCommandBuilder()
    .setName('mode')
    .setDescription('Aktivera ett sparat läge')
    .addStringOption((o) =>
      o.setName('namn').setDescription('Lägets namn eller ID').setRequired(true),
    ),
].map((c) => c.toJSON());
export function describeResults(results: CommandResult[]) {
  return results
    .map((r) => `${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ': ' + r.error : ''}`)
    .join('\n');
}
function findByName<T extends { id: string; name: string }>(entries: T[], value: string) {
  const matches = entries.filter(
    (e) => e.id === value || e.name.toLowerCase() === value.toLowerCase(),
  );
  insist(matches.length === 1, 'Ange ett unikt namn eller ElRusty-ID från webbpanelen.');
  return matches[0];
}
export async function dispatchDiscord(
  service: LiveService,
  input: {
    guildId: string | null;
    userId: string;
    roles: string[];
    command: string;
    name?: string;
    value?: boolean;
  },
) {
  insist(
    authorized(service.config.discord, input.guildId, input.userId, input.roles),
    'Du saknar behörighet.',
  );
  const state = service.snapshot();
  switch (input.command) {
    case 'status':
      return `Rust+: ${state.connection}\nServer: ${state.profiles.find((p) => p.id === state.activeProfileId)?.name || 'Ingen vald'}`;
    case 'team': {
      const team =
        state.team
          .map(
            (m) =>
              `${m.name} · ${m.isOnline ? 'online' : 'offline'} · ${m.isAlive ? 'alive' : 'dead'}`,
          )
          .join('\n') || 'Ingen teaminformation.';
      return (
        (state.connection !== 'connected' || !state.teamUpdatedAt
          ? 'Inaktuell information\n'
          : '') + team
      );
    }
    case 'switch': {
      insist(typeof input.value === 'boolean', 'Ange på eller av.');
      const d = findByName(
        state.devices.filter((d) => d.type === 'switch'),
        input.name || '',
      );
      return describeResults(await service.run([{ deviceId: d.id, value: input.value }]));
    }
    case 'group':
      insist(typeof input.value === 'boolean', 'Ange på eller av.');
      return describeResults(await service.runGroup(input.name || '', input.value));
    case 'mode':
      return describeResults(await service.runMode(findByName(state.modes, input.name || '').id));
    default:
      throw new Error('Okänt kommando.');
  }
}
export class DiscordBot {
  private client: Client | null = null;
  private generation = 0;
  constructor(private service: LiveService) {
    service.on('alarm', this.alarm);
  }
  private status(value: string) {
    this.service.discordStatus = value;
    this.service.changed();
  }
  async start() {
    await this.stop();
    const config = this.service.config.discord;
    insist(config.token && config.guildId, 'Spara Discord-token och server-ID först.');
    const gen = ++this.generation,
      client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.client = client;
    this.status('Ansluter…');
    client.on('error', () => {
      if (gen === this.generation) this.status('Discord-anslutningsfel');
    });
    client.on('shardDisconnect', () => {
      if (gen === this.generation) this.status('Återansluter…');
    });
    client.on('shardResume', () => {
      if (gen === this.generation) this.status('Ansluten');
    });
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const member = interaction.member,
        roles =
          member && 'cache' in member.roles
            ? [...member.roles.cache.keys()]
            : Array.isArray(member?.roles)
              ? member.roles
              : [];
      if (
        gen !== this.generation ||
        !authorized(this.service.config.discord, interaction.guildId, interaction.user.id, roles)
      ) {
        await interaction
          .reply({
            content: 'Du har inte behörighet att använda ElRusty här.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (gen !== this.generation) return;
        const response = await dispatchDiscord(this.service, {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          roles,
          command: interaction.commandName,
          name:
            interaction.options.getString(
              interaction.commandName === 'switch' ? 'enhet' : 'namn',
            ) || undefined,
          value: interaction.options.getBoolean('pa') ?? undefined,
        });
        await interaction.editReply({
          content: response.slice(0, 1900) || 'Ok.',
          allowedMentions: { parse: [] },
        });
      } catch {
        if (interaction.deferred)
          await interaction
            .editReply({
              content: 'Kommandot kunde inte utföras. Kontrollera anslutning och namn i ElRusty.',
              allowedMentions: { parse: [] },
            })
            .catch(() => {});
      }
    });
    try {
      await client.login(config.token);
      if (gen !== this.generation) {
        await client.destroy();
        return;
      }
      const guild = await client.guilds.fetch(config.guildId);
      await guild.commands.set(commands);
      if (gen === this.generation) {
        this.service.config.discord.enabled = true;
        this.service.db.save(this.service.config);
        this.status('Ansluten');
      }
    } catch {
      if (gen === this.generation) {
        await this.stop();
        this.status('Kunde inte ansluta. Kontrollera token, server-ID och botens behörigheter.');
      }
      throw new Error('Discord kunde inte anslutas.');
    }
  }
  private alarm = (event: Activity) => {
    const gen = this.generation,
      client = this.client,
      config = this.service.config.discord;
    if (!client?.isReady() || !config.channelId) return;
    void (async () => {
      try {
        const channel = await client.channels.fetch(config.channelId);
        if (gen !== this.generation || event.profileId !== this.service.config.activeProfileId)
          return;
        insist(
          channel &&
            'guildId' in channel &&
            channel.guildId === config.guildId &&
            channel.isSendable(),
          'Ogiltig larmkanal.',
        );
        await channel.send({
          content:
            `🚨 ${this.service.config.profiles.find((p) => p.id === event.profileId)?.name || 'Rust'} · ${event.text}`.slice(
              0,
              1900,
            ),
          allowedMentions: { parse: [] },
        });
      } catch {
        if (gen === this.generation)
          this.service.log(
            'error',
            'Discord-larm kunde inte levereras. Kontrollera kanal och behörigheter.',
          );
      }
    })();
  };
  async stop() {
    this.generation++;
    const old = this.client;
    this.client = null;
    if (old) await old.destroy();
    this.service.config.discord.enabled = false;
    this.service.db.save(this.service.config);
    this.status('Avstängd');
  }
  async close() {
    this.service.off('alarm', this.alarm);
    this.generation++;
    await this.client?.destroy();
    this.client = null;
  }
}
