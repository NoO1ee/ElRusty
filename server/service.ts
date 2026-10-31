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
  discordStatus = 'Avstängd';
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
  }
  snapshot(): LiveSnapshot {
    const { discord, profiles, activeProfileId } = this.config;
    return structuredClone({
      world: this.world?.snapshot(),
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
    this.config.profiles = this.config.profiles.filter((p) => p.id !== id);
    this.config.devices = this.config.devices.filter((d) => d.profileId !== id);
    this.config.modes = this.config.modes.filter((m) => m.profileId !== id);
    this.save();
  }
  private stop() {
    this.generation++;
    this.world?.stop();
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
    const fail = (reason?: string) => {
      if (gen !== this.generation || lost) return;
      lost = true;
      this.generation++;
      clearTimeout(this.stable);
      this.world?.stop();
      adapter.close();
      this.adapter = null;
      clearInterval(this.poll);
      this.pending.clear();
      this.verified.clear();
      this.timeBusy = false;
      this.connection = 'reconnecting';
      this.connectionError =
        reason === 'protocol'
          ? 'Rust+-servern skickade ett meddelande som inte kunde tolkas. Anslutningen återupprättas; din parning finns kvar.'
          : 'Kunde inte nå eller autentisera mot Rust+. Kontrollera server, app.port och parning.';
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
      this.world?.connected(information);
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
        this.team = team;
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
  liveSession() {
    return this.session();
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
  async addDevice(body: unknown) {
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
          return { deviceId: v.deviceId, name: v.device.name, ok: true };
        } catch (e) {
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
  async onChat(message: ChatMessage, gen = this.generation) {
    if (
      this.connection !== 'connected' ||
      gen !== this.generation ||
      typeof message.message !== 'string' ||
      message.message.trim().toLowerCase() !== '!time'
    )
      return;
    const key = JSON.stringify([message.steamId, message.time, message.message]);
    if (this.seenChat.has(key)) return;
    this.seenChat.add(key);
    if (this.seenChat.size > 1000) this.seenChat.delete(this.seenChat.values().next().value!);
    if (this.timeBusy || this.now() - this.timeLast < 5000) return;
    const adapter = this.adapter!;
    this.timeBusy = true;
    this.timeLast = this.now();
    try {
      let response: string;
      try {
        response = '[ElRusty] Speltid: ' + formatTime(await adapter.time());
      } catch {
        response = '[ElRusty] Kunde inte hämta speltiden.';
      }
      if (gen === this.generation && this.connection === 'connected') {
        this.timeLast = this.now();
        await adapter.chat(response);
      }
    } catch {
      /* No delayed retries for chat replies. */
    } finally {
      if (gen === this.generation) this.timeBusy = false;
    }
  }
  close() {
    this.stop();
    this.removeAllListeners();
  }
}
