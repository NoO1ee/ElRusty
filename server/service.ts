import { LiveClock } from './live-clock.ts';
import { TimerEngine } from './timer-engine.ts';
import { nextLastDeath, type LastDeath, type TeamMapNote } from '../shared/team-map.ts';
import { commandReply, isKnownCommand, plainText, publicChatError, TextQueue } from './chat.ts';
import type { LiveWorld } from './world.ts';
import type { PairingStatus } from '../shared/live.ts';
import { EventEmitter } from 'node:events';
import type { LiveSnapshot, Entity, DeviceState, CommandResult, Activity } from '../shared/live.ts';
import { LiveDB, type Config, type PrivateProfile } from './db.ts';
import type { RustAdapter, ChatMessage } from './rust.ts';
import { UserError, insist } from './validation.ts';
import * as validate from './validation.ts';
export function formatTime(hour: number): string {
  insist(Number.isFinite(hour), 'Ogiltig speltid.');
  const minutes = ((Math.floor(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export class LiveService extends EventEmitter {
  config: Config;
  readonly timers: TimerEngine;
  readonly clock: LiveClock;
  profileEpoch = 0;
  world?: LiveWorld;
  pairing: PairingStatus = {
    status: 'idle',
    message: '',
    hasRegistration: false,
    running: false,
    candidates: [],
  };
  connection: LiveSnapshot['connection'] = 'disconnected';
  connectionError = '';
  states: Record<string, DeviceState> = {};
  pending = new Set<string>();
  verified = new Set<string>();
  team: LiveSnapshot['team'] = [];
  teamUpdatedAt: number | null = null;
  mapNotes: TeamMapNote[] = [];
  lastDeath: LastDeath | null = null;
  private deathKey = '';
  private serviceStartedAt: number;
  private connectedAt: number | null = null;
  discordStatus = 'Avstängd';
  relayError = '';
  private relayQueue = new TextQueue();
  private adapter: RustAdapter | null = null;
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private retries = 0;
  private stable: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private timeBusy = false;
  private timeLast = -Infinity;
  private seenChat = new Set<string>();
  private alarmBaseline = new Map<string, boolean>();
  constructor(
    readonly db: LiveDB,
    private factory: (p: PrivateProfile) => RustAdapter,
    private now = () => Date.now(),
  ) {
    super();
    this.config = db.load();
    this.serviceStartedAt = this.now();
    this.timers = new TimerEngine(this, this.now);
    this.clock = new LiveClock(this);
  }
  snapshot(): LiveSnapshot {
    const { discord, profiles, activeProfileId } = this.config;
    return structuredClone({
      world: this.world?.snapshot(),
      ...this.timers.snapshot(),
      mapNotes: this.mapNotes,
      lastDeath: this.lastDeath,
      pairing: this.pairing,
      profiles: profiles.map(({ playerToken, ...p }) => p),
      activeProfileId,
      devices: this.config.devices.filter((d) => d.profileId === activeProfileId),
      modes: this.config.modes.filter((m) => m.profileId === activeProfileId),
      connection: this.connection,
      connectionError: this.connectionError,
      team: this.team,
      teamUpdatedAt: this.teamUpdatedAt,
      states: this.states,
      verified: [...this.verified],
      pending: [...this.pending],
      activity: this.db.history().filter((e) => e.profileId === activeProfileId),
      discord: {
        categoryId: discord.categoryId,
        channels: discord.channels,
        botId: discord.botId,
        relayEnabled: discord.relayEnabled,
        relayError: this.relayError,
        guildId: discord.guildId,
        channelId: discord.channelId,
        userIds: discord.userIds,
        roleIds: discord.roleIds,
        hasToken: !!discord.token,
        status: this.discordStatus,
      },
    });
  }
  changed() {
    this.emit('change');
  }
  private save() {
    this.db.save(this.config);
    this.changed();
  }
  log(kind: Activity['kind'], text: string) {
    if (!this.config.activeProfileId) return;
    const entry = {
      id: crypto.randomUUID(),
      at: this.now(),
      profileId: this.config.activeProfileId,
      kind,
      text,
    };
    this.db.log(entry);
    this.emit('activity', entry);
    this.changed();
    return entry;
  }
  saveProfile(body: unknown, id?: string) {
    const old = id ? this.config.profiles.find((p) => p.id === id) : undefined;
    insist(!id || old, 'Serverprofilen finns inte.');
    const p = validate.profile(body, old);
    insist(this.config.profiles.length < 20 || old, 'Högst 20 serverprofiler.');
    if (id === this.config.activeProfileId) this.disconnect();
    this.config.profiles = this.config.profiles.filter((x) => x.id !== p.id).concat(p);
    this.save();
    return p.id;
  }
  deleteProfile(id: string) {
    if (id === this.config.activeProfileId) this.disconnect();
    this.db.timers.deleteProfile(id);
    if (this.config.timeCalibrations) delete this.config.timeCalibrations[id];
    this.config.profiles = this.config.profiles.filter((p) => p.id !== id);
    for (const key of Object.keys(this.config.deathLocations || {}))
      if (key.startsWith(id + ':')) delete this.config.deathLocations![key];
    this.config.devices = this.config.devices.filter((d) => d.profileId !== id);
    this.config.modes = this.config.modes.filter((m) => m.profileId !== id);
    this.save();
  }
  timing() {
    return {
      now: this.now(),
      serviceStartedAt: this.serviceStartedAt,
      connectedAt: this.connectedAt,
    };
  }
  private stop() {
    this.profileEpoch++;
    this.connectedAt = null;
    this.generation++;
    this.relayQueue.clear();
    this.emit('sessionLost');
    this.world?.stop();
    this.clock.stop();
    clearTimeout(this.retry);
    clearTimeout(this.stable);
    clearInterval(this.poll);
    this.retry = undefined;
    this.poll = undefined;
    this.adapter?.close();
    this.adapter = null;
    this.pending.clear();
    this.verified.clear();
    this.timeBusy = false;
    this.alarmBaseline.clear();
  }
  disconnect() {
    this.stop();
    this.config.activeProfileId = null;
    this.connection = 'disconnected';
    this.connectionError = '';
    this.team = [];
    this.teamUpdatedAt = null;
    this.states = {};
    this.seenChat.clear();
    this.save();
  }
  connect(id: string) {
    insist(
      this.config.profiles.some((p) => p.id === id),
      'Serverprofilen finns inte.',
    );
    this.stop();
    this.config.activeProfileId = id;
    this.world?.select(id);
    this.retries = 0;
    this.mapNotes = [];
    this.lastDeath = null;
    this.deathKey = '';
    this.timeLast = -Infinity;
    this.seenChat.clear();
    this.states = {};
    this.team = [];
    this.teamUpdatedAt = null;
    this.save();
    void this.establish(false);
  }
  private async establish(reconnecting: boolean) {
    const p = this.config.profiles.find((p) => p.id === this.config.activeProfileId);
    if (!p) return;
    const gen = ++this.generation,
      adapter = this.factory(p);
    this.adapter = adapter;
    this.alarmBaseline.clear();
    this.verified.clear();
    this.connection = reconnecting ? 'reconnecting' : 'connecting';
    this.connectionError = '';
    this.changed();
    let lost = false;
    const fail = (reason?: string, field?: string) => {
      if (gen !== this.generation || lost) return;
      lost = true;
      this.generation++;
      this.relayQueue.clear();
      this.emit('sessionLost');
      clearTimeout(this.stable);
      this.world?.stop();
      this.clock.stop();
      adapter.close();
      this.adapter = null;
      clearInterval(this.poll);
      this.pending.clear();
      this.verified.clear();
      this.timeBusy = false;
      this.connectedAt = null;
      this.connection = 'reconnecting';
      this.connectionError =
        reason === 'protocol'
          ? 'Rust+-servern skickade ett meddelande som inte kunde tolkas. Anslutningen återupprättas; din parning finns kvar.'
          : 'Kunde inte nå eller autentisera mot Rust+. Kontrollera server, app.port och parning.';
      if (reason === 'protocol' && field && /^rustplus\.[A-Za-z0-9_.]{1,120}$/.test(field))
        this.connectionError += ' Saknat fält: ' + field + '.';
      this.changed();
      this.retry = setTimeout(
        () => void this.establish(true),
        Math.min(30000, 1000 * 2 ** Math.min(this.retries++, 5)),
      );
    };
    adapter.on('lost', fail);
    adapter.on('entity', (entityId: number, payload: any) => {
      if (gen !== this.generation || this.connection !== 'connected') return;
      const d = this.config.devices.find((d) => d.profileId === p.id && d.entityId === entityId);
      if (!d) return;
      const value = !!payload?.value,
        previous = this.alarmBaseline.get(d.id);
      this.states[d.id] = { type: d.type, value, items: payload?.items, updatedAt: this.now() };
      this.alarmBaseline.set(d.id, value);
      if (d.type === 'alarm' && value && previous === false) {
        const event = this.log('alarm', `Smart Alarm: ${d.name}`);
        if (event) this.emit('alarm', event);
      }
      this.changed();
    });
    adapter.on('chat', (message: ChatMessage) => {
      if (gen === this.generation) void this.onChat(message, gen);
    });
    adapter.on('teamChanged', () => {
      if (gen === this.generation && this.connection === 'connected') void this.refreshTeam(gen);
    });
    try {
      await adapter.open();
      if (gen !== this.generation) return;
      const information = await adapter.info();
      if (gen !== this.generation) return;
      this.connection = 'connected';
      this.connectedAt = this.now();
      this.deathKey =
        p.id +
        ':' +
        (information
          ? [information.wipeTime, information.seed ?? '', information.mapSize].join(':')
          : 'unknown');
      this.config.deathLocations ??= {};
      for (const key of Object.keys(this.config.deathLocations))
        if (key.startsWith(p.id + ':') && key !== this.deathKey)
          delete this.config.deathLocations[key];
      this.lastDeath = this.config.deathLocations[this.deathKey] || null;
      this.world?.connected(information);
      this.clock.start(p.id, this.deathKey);
      this.log('info', `Ansluten till ${p.name}.`);
      await this.refreshTeam(gen);
      for (const d of this.config.devices.filter((d) => d.profileId === p.id)) {
        try {
          const state = await adapter.entity(d.entityId);
          if (gen !== this.generation) return;
          insist(state.type === d.type, 'Enheten har bytt typ.');
          this.states[d.id] = { ...state, updatedAt: this.now() };
          this.verified.add(d.id);
          this.alarmBaseline.set(d.id, state.value);
        } catch {
          if (gen === this.generation)
            this.log('error', `Kunde inte verifiera ${d.name}. Para om enheten vid behov.`);
        }
      }
      if (gen !== this.generation) return;
      this.changed();
      this.poll = setInterval(() => void this.refreshTeam(gen), 5000);
      this.stable = setTimeout(() => {
        if (gen === this.generation && this.connection === 'connected') this.retries = 0;
      }, 30000);
    } catch {
      fail();
    }
  }
  private refreshingGeneration: number | null = null;
  async refreshTeam(gen = this.generation) {
    if (!this.adapter || this.connection !== 'connected' || this.refreshingGeneration === gen)
      return;
    this.refreshingGeneration = gen;
    const adapter = this.adapter;
    try {
      const team = await adapter.team();
      if (gen === this.generation) {
        this.acceptTeam(team, adapter.teamNotes?.() || []);
        this.teamUpdatedAt = this.now();
        this.changed();
      }
    } catch {
      if (gen === this.generation) {
        this.teamUpdatedAt = null;
        this.changed();
      }
    } finally {
      if (this.refreshingGeneration === gen) this.refreshingGeneration = null;
    }
  }
  private acceptTeam(team: LiveSnapshot['team'], notes: TeamMapNote[]) {
    const owner = this.config.profiles.find((p) => p.id === this.config.activeProfileId)?.playerId;
    const next = nextLastDeath(
      this.lastDeath,
      this.team.find((m) => m.steamId === owner),
      team.find((m) => m.steamId === owner),
      notes,
      this.now(),
    );
    this.team = team;
    this.mapNotes = notes;
    if (next !== this.lastDeath && next && this.deathKey) {
      this.lastDeath = next;
      this.config.deathLocations ??= {};
      this.config.deathLocations[this.deathKey] = next;
      this.db.save(this.config);
    }
  }
  liveSession() {
    return this.session();
  }
  isLiveSession(gen: number) {
    return gen === this.generation && this.connection === 'connected';
  }
  assertSession(gen: number) {
    this.current(gen);
  }
  private session() {
    insist(this.connection === 'connected' && this.adapter, 'Rust+ är inte anslutet.');
    return { adapter: this.adapter, gen: this.generation, profileId: this.config.activeProfileId! };
  }
  private current(gen: number) {
    insist(
      gen === this.generation && this.connection === 'connected',
      'Anslutningen ändrades. Kommandot avbröts.',
    );
  }
  async addDevice(body: unknown, expectedType?: import('../shared/live.ts').DeviceType) {
    const { adapter, gen, profileId } = this.session(),
      draft = validate.device(body, profileId);
    insist(
      !this.config.devices.some((d) => d.profileId === profileId && d.entityId === draft.entityId),
      'Enheten finns redan.',
    );
    insist(
      this.config.devices.filter((d) => d.profileId === profileId).length < 100,
      'Högst 100 enheter per server.',
    );
    const entity = await adapter.entity(draft.entityId);
    this.current(gen);
    insist(
      !this.config.devices.some((d) => d.profileId === profileId && d.entityId === draft.entityId),
      'Enheten finns redan.',
    );
    insist(
      !expectedType || entity.type === expectedType,
      'Enhetens typ stämmer inte med parningen.',
    );
    const d = { ...draft, type: entity.type };
    this.config.devices.push(d);
    this.states[d.id] = { ...entity, updatedAt: this.now() };
    this.verified.add(d.id);
    this.alarmBaseline.set(d.id, entity.value);
    this.save();
    return d;
  }
  updateDevice(id: string, body: unknown) {
    const d = this.config.devices.find(
      (d) => d.id === id && d.profileId === this.config.activeProfileId,
    );
    insist(d, 'Enheten finns inte.');
    const b = validate.object(body);
    d.name = validate.text(b.name);
    d.group = b.group ? validate.text(b.group, 60) : '';
    this.save();
  }
  deleteDevice(id: string) {
    insist(!this.pending.has(id), 'Vänta tills kommandot är klart.');
    this.config.devices = this.config.devices.filter((d) => d.id !== id);
    for (const mode of this.config.modes)
      mode.values = mode.values.filter((v) => v.deviceId !== id);
    this.config.modes = this.config.modes.filter((m) => m.values.length);
    delete this.states[id];
    this.alarmBaseline.delete(id);
    this.save();
  }
  saveMode(body: unknown, id?: string) {
    const profileId = this.config.activeProfileId;
    insist(profileId, 'Välj en server först.');
    const m = validate.mode(body, this.config, profileId);
    if (id) {
      insist(
        this.config.modes.some((m) => m.id === id && m.profileId === profileId),
        'Läget finns inte.',
      );
      m.id = id;
    }
    this.config.modes = this.config.modes.filter((x) => x.id !== m.id).concat(m);
    this.save();
    return m;
  }
  deleteMode(id: string) {
    this.config.modes = this.config.modes.filter((m) => m.id !== id);
    this.save();
  }
  async run(values: { deviceId: string; value: boolean }[]): Promise<CommandResult[]> {
    const { gen, profileId, adapter } = this.session();
    const devices = values.map((v) => {
      const d = this.config.devices.find(
        (d) => d.id === v.deviceId && d.profileId === profileId && d.type === 'switch',
      );
      insist(d, 'Ogiltig switch.');
      insist(!this.pending.has(d.id), 'Enheten har redan ett väntande kommando.');
      return { ...v, device: d };
    });
    for (const v of devices) this.pending.add(v.deviceId);
    this.changed();
    const results = devices.map((v) => {
      const task = this.queue.then(async () => {
        try {
          this.current(gen);
          insist(this.verified.has(v.deviceId), 'Enheten är inte verifierad i denna anslutning.');
          insist(
            this.config.devices.some((d) => d.id === v.deviceId),
            'Enheten har tagits bort.',
          );
          await adapter.set(v.device.entityId, v.value);
          this.current(gen);
          const state = await adapter.entity(v.device.entityId);
          this.current(gen);
          insist(
            state.type === 'switch' && state.value === v.value,
            'Servern bekräftade inte önskat switchläge.',
          );
          this.states[v.deviceId] = { ...state, updatedAt: this.now() };
          this.log('info', `${v.device.name}: ${v.value ? 'på' : 'av'} bekräftat.`);
          return { deviceId: v.deviceId, name: v.device.name, ok: true };
        } catch (e) {
          if (gen === this.generation)
            this.log('error', v.device.name + ': styrning kunde inte bekräftas.');
          return {
            deviceId: v.deviceId,
            name: v.device.name,
            ok: false,
            error: e instanceof UserError ? e.message : 'Rust+ kunde inte bekräfta kommandot.',
          };
        } finally {
          if (gen === this.generation) {
            this.pending.delete(v.deviceId);
            this.changed();
          }
        }
      });
      this.queue = task.catch(() => {});
      return task;
    });
    return Promise.all(results);
  }
  runGroup(group: string, value: boolean) {
    const ds = this.snapshot().devices.filter((d) => d.group === group && d.type === 'switch');
    insist(ds.length, 'Gruppen innehåller inga switches.');
    return this.run(ds.map((d) => ({ deviceId: d.id, value })));
  }
  runMode(id: string) {
    const m = this.snapshot().modes.find((m) => m.id === id);
    insist(m, 'Läget finns inte.');
    return this.run(m.values);
  }
  saveDiscord(body: unknown) {
    this.config.discord = validate.discord(body, this.config.discord);
    this.save();
  }

  setControlUsers(id: string, users: unknown) {
    const p = this.config.profiles.find((p) => p.id === id);
    insist(p, 'Serverprofilen finns inte.');
    insist(
      Array.isArray(users) &&
        users.length <= 100 &&
        users.every((id) => typeof id === 'string' && /^\d{17}$/.test(id)),
      'Ange SteamID64 som 17 siffror.',
    );
    p.controlSteamIds = [...new Set(users as string[])];
    this.save();
  }
  async promoteCaller(steamId: string, expectedGen: number) {
    const { adapter, gen, profileId } = this.session();
    this.current(expectedGen);
    const p = this.config.profiles.find((p) => p.id === profileId)!;
    const task = this.queue.then(async () => {
      this.current(gen);
      insist(
        steamId === p.playerId || p.controlSteamIds?.includes(steamId),
        'Du saknar behörighet för styrkommandon.',
      );
      const team = await adapter.team();
      this.current(gen);
      insist(
        team.some((m) => m.steamId === steamId),
        'Spelaren finns inte i teamet.',
      );
      if (team.some((m) => m.steamId === steamId && m.isLeader)) return 'Du är redan teamledare.';
      insist(
        team.some((m) => m.steamId === p.playerId && m.isLeader),
        'Det parade kontot måste vara teamledare.',
      );
      insist(adapter.promote, 'Ledarskapsbyte stöds inte.');
      await adapter.promote(steamId);
      this.current(gen);
      const confirmed = await adapter.team();
      this.current(gen);
      this.acceptTeam(confirmed, adapter.teamNotes?.() || []);
      this.teamUpdatedAt = this.now();
      this.changed();
      insist(
        confirmed.some((m) => m.steamId === steamId && m.isLeader),
        'Servern bekräftade inte ledarskapsbytet.',
      );
      this.log('info', 'Teamledarskapet har bytts och bekräftats.');
      return 'Du är nu teamledare.';
    });
    this.queue = task.catch(() => {});
    return task;
  }
  relayFromDiscord(name: string, text: string, valid: () => boolean = () => true) {
    const { adapter, gen } = this.session();
    insist(this.config.discord.relayEnabled, 'Chattkopplingen är avstängd.');
    const message = plainText('[Discord] ' + plainText(name, 24) + ': ' + text, 120);
    return this.relayQueue.push(
      message,
      async (text) => {
        this.current(gen);
        await adapter.chat(text);
      },
      () =>
        gen === this.generation &&
        this.connection === 'connected' &&
        !!this.config.discord.relayEnabled &&
        valid(),
    );
  }
  async onChat(message: ChatMessage, gen = this.generation) {
    if (
      this.connection !== 'connected' ||
      gen !== this.generation ||
      typeof message.message !== 'string' ||
      !Number.isFinite(message.time)
    )
      return;
    if (/^\s*\[(ElRusty|Discord)\]/i.test(message.message)) return;
    const key = JSON.stringify([message.steamId, message.time, message.message]);
    if (this.seenChat.has(key)) return;
    this.seenChat.add(key);
    if (this.seenChat.size > 1000) this.seenChat.delete(this.seenChat.values().next().value!);
    const member = this.team.find((m) => m.steamId === message.steamId);
    if (!member || this.teamUpdatedAt === null) return;
    if (!isKnownCommand(message.message)) {
      this.emit('teamChat', {
        profileId: this.config.activeProfileId,
        gen,
        name: member.name,
        text: plainText(message.message, 500),
        at: this.now(),
      });
      return;
    }
    if (this.timeBusy || this.now() - this.timeLast < 5000) return;
    const adapter = this.adapter!;
    this.timeBusy = true;
    this.timeLast = this.now();
    try {
      let response: string;
      try {
        response = await commandReply(this, message, gen);
      } catch (e) {
        response = publicChatError(e);
      }
      if (gen !== this.generation || this.connection !== 'connected') return;
      this.timeLast = this.now();
      // Rust team chat has a small message limit. Preserve all help/results across bounded chunks.
      const words = plainText(response, 600).split(' ');
      let chunk = '';
      for (const word of words) {
        if ([...(chunk + ' ' + word)].length > 108 && chunk) {
          this.current(gen);
          await adapter.chat('[ElRusty] ' + chunk);
          chunk = '';
        }
        chunk += (chunk ? ' ' : '') + word;
      }
      if (chunk) {
        this.current(gen);
        await adapter.chat('[ElRusty] ' + chunk);
      }
    } catch {
      /* No delayed replies or retries. */
    } finally {
      if (gen === this.generation) this.timeBusy = false;
    }
  }
  close() {
    this.stop();
    this.timers.close();
    this.removeAllListeners();
  }
}
