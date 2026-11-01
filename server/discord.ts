import type { TimerTransport } from './timer-engine.ts';
import { plainText, TextQueue } from './chat.ts';
import {
  discordSetupPreview,
  provisionDiscord,
  managedAccessValid,
  type ManagedChannel,
} from './discord-setup.ts';
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
  constructor(
    private service: LiveService,
    private makeClient = (intents: number[]) =>
      new Client({ intents, rest: { timeout: 8000, retries: 0 } }),
  ) {
    service.timers.discord = () => this.prepareTimerNotification();
    service.on('teamChat', this.teamChat);
    service.on('sessionLost', this.clearChat);
    service.on('alarm', this.alarm);
    service.on('worldEvent', this.worldEvent);
    service.on('activity', this.activity);
    service.on('change', this.scheduleStatus);
  }
  private status(value: string) {
    this.service.discordStatus = value;
    this.service.changed();
  }
  async start(discoverOnly = false, withoutRelay = false) {
    await this.stop();
    const config = this.service.config.discord;
    insist(
      config.token && (discoverOnly || config.guildId),
      'Spara Discord-token och server-ID först.',
    );
    this.service.relayError = withoutRelay
      ? 'Chattkopplingen är pausad: aktivera Message Content Intent i Discord Developer Portal och starta boten igen. Övriga Discord-funktioner är igång.'
      : '';
    const wantsRelay = !!config.relayEnabled && !withoutRelay;
    const gen = ++this.generation,
      client = this.makeClient(
        wantsRelay
          ? [
              GatewayIntentBits.Guilds,
              GatewayIntentBits.GuildMessages,
              GatewayIntentBits.MessageContent,
            ]
          : [GatewayIntentBits.Guilds],
      );
    let loggedIn = false,
      deniedIntent = false;
    this.relayReady = false;
    this.client = client;
    this.status('Ansluter…');
    client.on('error', () => {
      if (gen === this.generation) this.status('Discord-anslutningsfel');
    });
    client.on('shardDisconnect', (event) => {
      this.clearChat();
      if (gen !== this.generation) return;
      this.service.timers.dropDiscord();
      if (event.code === 4014 && wantsRelay) {
        deniedIntent = true;
        if (loggedIn) void this.start(discoverOnly, true).catch(() => {});
      } else this.status('Återansluter…');
    });
    client.on('messageCreate', (message) => {
      if (gen === this.generation) void this.handleTeamChat(message, gen).catch(() => {});
    });
    client.on('shardResume', () => {
      this.relaySince = Date.now();
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
      loggedIn = true;
      if (gen !== this.generation) {
        await client.destroy();
        return;
      }
      if (!discoverOnly) {
        const guild = await client.guilds.fetch(config.guildId);
        await guild.commands.set(commands);
      }
      if (gen === this.generation) {
        if (!discoverOnly) this.service.config.discord.enabled = true;
        this.service.db.save(this.service.config);
        this.relayReady = wantsRelay;
        this.status('Ansluten');
      }
    } catch (error) {
      if (
        gen === this.generation &&
        wantsRelay &&
        (deniedIntent || (error as { code?: unknown })?.code === 'DisallowedIntents')
      ) {
        await this.start(discoverOnly, true);
        return;
      }
      if (gen === this.generation) {
        await this.stop();
        this.status('Kunde inte ansluta. Kontrollera token, server-ID och botens behörigheter.');
      }
      throw new Error('Discord kunde inte anslutas.');
    }
  }
  private relayReady = false;
  private chatOut = new TextQueue();
  private seenDiscord = new Set<string>();
  private relaySince = Date.now();
  private clearChat = () => {
    this.chatOut.clear();
    this.relaySince = Date.now();
  };
  private teamChat = (event: {
    profileId: string;
    gen: number;
    name: string;
    text: string;
    at: number;
  }) => {
    const client = this.client,
      botGen = this.generation;
    if (
      !this.relayReady ||
      !client?.isReady() ||
      !this.service.config.discord.relayEnabled ||
      !managedAccessValid(this.service.config.discord)
    )
      return;
    this.chatOut.push(
      plainText(event.name, 40) + ': ' + plainText(event.text, 500),
      async (text) => {
        const channel = await this.managedText('teamchat');
        if (
          channel &&
          this.service.isLiveSession(event.gen) &&
          botGen === this.generation &&
          this.relayReady
        )
          await channel.send({ content: text, allowedMentions: { parse: [] } });
      },
      () =>
        this.service.isLiveSession(event.gen) &&
        botGen === this.generation &&
        !!client.isReady() &&
        this.relayReady &&
        !!this.service.config.discord.relayEnabled,
    );
  };
  async handleTeamChat(message: any, gen = this.generation) {
    const config = this.service.config.discord;
    if (
      gen !== this.generation ||
      !this.relayReady ||
      !config.relayEnabled ||
      !managedAccessValid(config) ||
      message.guildId !== config.guildId ||
      !Number.isFinite(message.createdTimestamp) ||
      message.createdTimestamp < this.relaySince ||
      message.channelId !== config.channels?.teamchat ||
      message.author?.bot ||
      message.webhookId ||
      message.system ||
      !message.content ||
      this.service.connection !== 'connected'
    )
      return;
    if (this.seenDiscord.has(message.id)) return;
    this.seenDiscord.add(message.id);
    if (this.seenDiscord.size > 1000)
      this.seenDiscord.delete(this.seenDiscord.values().next().value!);
    const roles = message.member?.roles?.cache ? [...message.member.roles.cache.keys()] : [];
    if (!authorized(config, message.guildId, message.author.id, roles)) return;
    const content = plainText(message.content, 500);
    if (!content) return;
    this.service.relayFromDiscord(
      message.member?.displayName ||
        message.author.globalName ||
        message.author.username ||
        'Discord-användare',
      content,
      () =>
        gen === this.generation &&
        !!this.client?.isReady() &&
        this.relayReady &&
        authorized(this.service.config.discord, message.guildId, message.author.id, roles),
    );
  }
  async setRelay(enabled: boolean) {
    const config = this.service.config.discord;
    insist(!this.setupBusy, 'Vänta tills kanalsetupen är klar.');
    if (enabled)
      insist(
        config.channels?.teamchat &&
          managedAccessValid(config) &&
          (config.userIds.length || config.roleIds.length),
        'Skapa privata ElRusty-kanaler och välj behörigheter först.',
      );
    config.relayEnabled = enabled;
    this.service.db.save(this.service.config);
    this.service.changed();
    await this.start();
  }
  prepareTimerNotification(): TimerTransport | null {
    const client = this.client,
      gen = this.generation,
      epoch = this.service.profileEpoch,
      config = this.service.config.discord,
      profileId = this.service.config.activeProfileId;
    const id = config.channels?.events,
      guildId = config.guildId;
    if (
      !client?.isReady() ||
      !config.enabled ||
      !profileId ||
      !config.categoryId ||
      !id ||
      !managedAccessValid(config)
    )
      return null;
    const valid = () =>
      gen === this.generation &&
      client.isReady() &&
      epoch === this.service.profileEpoch &&
      profileId === this.service.config.activeProfileId &&
      !!this.service.config.discord.enabled &&
      this.service.config.discord.channels?.events === id &&
      managedAccessValid(this.service.config.discord);
    return {
      valid,
      send: async (timer) => {
        if (!valid()) return false;
        const channel = await client.channels.fetch(id);
        if (!valid()) return false;
        insist(
          channel && 'guildId' in channel && channel.guildId === guildId && channel.isSendable(),
          'Ogiltig timerkanal.',
        );
        const name = this.service.config.profiles.find((p) => p.id === profileId)?.name || 'Rust';
        await channel.send({
          content: plainText(
            'Timer klar: ' +
              timer.name +
              ' (' +
              timer.shortId +
              ') · ' +
              name +
              ' · ' +
              timer.creatorName,
            300,
          ),
          allowedMentions: { parse: [] },
        });
        return true;
      },
    };
  }
  private setupBusy = false;
  get isSettingUp() {
    return this.setupBusy;
  }
  async accessOptions() {
    insist(this.client?.isReady(), 'Starta Discord-boten först för att hämta namn och roller.');
    const guild = await this.client.guilds.fetch(this.service.config.discord.guildId);
    return [...(await guild.roles.fetch()).values()]
      .filter((r) => r.id !== guild.id)
      .map((r) => ({ id: r.id, name: r.name }));
  }
  async accessUser(id: string) {
    insist(/^\d{17,20}$/.test(id), 'Ogiltigt Discord-användar-ID.');
    insist(this.client?.isReady(), 'Starta Discord-boten först för att hämta personen.');
    const guild = await this.client.guilds.fetch(this.service.config.discord.guildId);
    const member = await guild.members.fetch({ user: id, force: true });
    return { id: member.id, name: member.displayName };
  }
  async guildList() {
    if (!this.client?.isReady()) await this.start(true);
    return [...this.client!.guilds.cache.values()]
      .filter((g) => g.available)
      .map((g) => ({ id: g.id, name: g.name }));
  }
  async preview() {
    if (!this.client?.isReady()) await this.start(true);
    const guild = await this.client!.guilds.fetch(this.service.config.discord.guildId);
    return discordSetupPreview(guild, this.client!.user!.id, this.service.config.discord);
  }
  async setup() {
    insist(!this.setupBusy, 'En kanalsetup pågår redan.');
    this.setupBusy = true;
    try {
      await this.preview();
      const guild = await this.client!.guilds.fetch(this.service.config.discord.guildId);
      const result = await provisionDiscord(
        guild,
        this.client!.user!.id,
        this.service.config.discord,
        () => {
          this.service.db.save(this.service.config);
          this.service.changed();
        },
      );
      await guild.commands.set(commands);
      this.service.config.discord.enabled = true;
      this.service.db.save(this.service.config);
      await this.instructions();
      this.scheduleStatus();
      return result;
    } finally {
      this.setupBusy = false;
    }
  }
  private deliveries = 0;
  private sending: Promise<unknown> = Promise.resolve();
  private deliver(kind: ManagedChannel, event: Activity) {
    const client = this.client,
      gen = this.generation,
      config = this.service.config.discord,
      id = config.channels?.[kind] || (kind === 'larm' ? config.channelId : '');
    if (!client?.isReady() || !id || this.deliveries >= 30 || !managedAccessValid(config)) return;
    this.deliveries++;
    const job = this.sending.then(async () => {
      if (gen !== this.generation || event.profileId !== this.service.config.activeProfileId)
        return;
      const channel = await client.channels.fetch(id);
      if (gen !== this.generation) return;
      insist(
        channel &&
          'guildId' in channel &&
          channel.guildId === config.guildId &&
          channel.isSendable(),
        'Ogiltig kanal.',
      );
      await channel.send({ content: event.text.slice(0, 1900), allowedMentions: { parse: [] } });
    });
    this.sending = job
      .catch(() => {
        if (gen === this.generation)
          this.service.log(
            'error',
            'Discord-leverans misslyckades. Kontrollera kanal och behörigheter.',
          );
      })
      .finally(() => {
        this.deliveries--;
      });
  }
  private alarm = (event: Activity) => this.deliver('larm', event);
  private worldEvent = (event: Activity) => this.deliver('events', event);
  private activity = (event: Activity) => {
    if (event.kind !== 'team' && !event.text.startsWith('Discord-'))
      this.deliver('aktivitet', event);
  };
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private statusBusy = false;
  private statusContent = '';
  private scheduleStatus = () => {
    if (
      this.statusTimer ||
      !this.client?.isReady() ||
      !this.service.config.discord.channels?.status
    )
      return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = undefined;
      void this.updateStatus();
    }, 5000);
  };
  private async managedText(kind: ManagedChannel) {
    if (!managedAccessValid(this.service.config.discord)) return null;
    const client = this.client,
      id = this.service.config.discord.channels?.[kind];
    if (!client?.isReady() || !id) return null;
    const channel = await client.channels.fetch(id);
    insist(
      channel &&
        'guildId' in channel &&
        channel.guildId === this.service.config.discord.guildId &&
        channel.isSendable(),
      'Ogiltig kanal.',
    );
    return channel;
  }
  private async updateStatus() {
    if (this.statusBusy) return;
    this.statusBusy = true;
    const gen = this.generation;
    try {
      const channel = await this.managedText('status');
      if (!channel || gen !== this.generation) return;
      const state = this.service.snapshot(),
        name = state.profiles.find((p) => p.id === state.activeProfileId)?.name || 'Ingen vald';
      const content =
        '**ElRusty** · ' +
        name +
        '\nRust+: ' +
        state.connection +
        '\nTeam online: ' +
        state.team.filter((m) => m.isOnline).length +
        '/' +
        state.team.length;
      if (content === this.statusContent) return;
      const config = this.service.config.discord;
      let message = config.statusMessageId
        ? await channel.messages.fetch(config.statusMessageId).catch((e: any) => {
            if (e.code === 10008) return null;
            throw e;
          })
        : null;
      if (gen !== this.generation) return;
      if (message) {
        insist(
          message.author.id === this.client!.user!.id,
          'Statusmeddelandet tillhör en annan användare.',
        );
        await message.edit({ content, allowedMentions: { parse: [] } });
      } else {
        message = await channel.send({ content, allowedMentions: { parse: [] } });
        config.statusMessageId = message.id;
        this.service.db.save(this.service.config);
      }
      this.statusContent = content;
    } catch {
      /* Status is retried on a later state update without creating log loops. */
    } finally {
      this.statusBusy = false;
    }
  }
  private async instructions() {
    const channel = await this.managedText('styrning');
    if (!channel) return;
    const config = this.service.config.discord;
    if (config.instructionsMessageId) {
      const old = await channel.messages.fetch(config.instructionsMessageId).catch((e: any) => {
        if (e.code === 10008) return null;
        throw e;
      });
      if (old) return;
    }
    const message = await channel.send({
      content:
        '**ElRusty – styrning**\n/status · /team · /switch · /group · /mode\nEndast tillåtna användare och roller kan styra boten. Chattkopplingen aktiveras separat i ElRusty.',
      allowedMentions: { parse: [] },
    });
    config.instructionsMessageId = message.id;
    this.service.db.save(this.service.config);
  }
  async stop() {
    this.service.timers.dropDiscord();
    this.relayReady = false;
    this.clearChat();
    this.generation++;
    clearTimeout(this.statusTimer);
    this.statusTimer = undefined;
    this.statusContent = '';
    const old = this.client;
    this.client = null;
    if (old) await old.destroy();
    this.service.config.discord.enabled = false;
    this.service.db.save(this.service.config);
    this.status('Avstängd');
  }
  async close() {
    this.service.timers.dropDiscord();
    this.service.timers.discord = undefined;
    this.relayReady = false;
    this.clearChat();
    this.service.off('teamChat', this.teamChat);
    this.service.off('sessionLost', this.clearChat);
    this.service.off('alarm', this.alarm);
    this.service.off('worldEvent', this.worldEvent);
    this.service.off('activity', this.activity);
    this.service.off('change', this.scheduleStatus);
    clearTimeout(this.statusTimer);
    this.generation++;
    await this.client?.destroy();
    this.client = null;
  }
}
