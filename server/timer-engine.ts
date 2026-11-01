import type { LiveService } from './service.ts';
import type { LiveTimer, TimerChannel, TimerDelivery } from '../shared/timers.ts';
import { parseTimerDuration, timerRemaining } from '../shared/timers.ts';
import { insist, object, text, UserError } from './validation.ts';
import { plainText } from './chat.ts';
export interface TimerTransport {
  valid(): boolean;
  send(timer: LiveTimer): Promise<boolean>;
}
interface Job {
  timer: LiveTimer;
  transport: TimerTransport;
}
class NoticeQueue {
  private items: Job[] = [];
  private inFlight: Job | null = null;
  private generation = 0;
  private nextAllowed = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private engine: TimerEngine,
    private channel: TimerChannel,
  ) {}
  push(job: Job) {
    if (this.items.length + (this.inFlight ? 1 : 0) >= 20) {
      this.engine.finish(job.timer.id, this.channel, 'missed', 'pending');
      return;
    }
    this.items.push(job);
    this.pump();
  }
  clear(shutdown = false) {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const job of this.items.splice(0))
      this.engine.finish(job.timer.id, this.channel, 'missed', 'pending');
    if (shutdown && this.inFlight)
      this.engine.finish(this.inFlight.timer.id, this.channel, 'unconfirmed', 'attempting');
    this.inFlight = null;
  }
  private pump() {
    if (this.inFlight || this.timer || !this.items.length) return;
    const wait = Math.max(0, this.nextAllowed - this.engine.now());
    if (wait) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, wait);
      return;
    }
    const job = this.items.shift()!,
      gen = this.generation;
    if (!job.transport.valid()) {
      this.engine.finish(job.timer.id, this.channel, 'missed', 'pending');
      this.pump();
      return;
    }
    if (!this.engine.attempt(job.timer.id, this.channel)) {
      this.pump();
      return;
    }
    this.inFlight = job;
    this.nextAllowed = this.engine.now() + 1000;
    this.engine.changed();
    void this.send(job, gen);
  }
  private async send(job: Job, gen: number) {
    let result: TimerDelivery = 'unconfirmed';
    try {
      result = (await job.transport.send(job.timer)) ? 'sent' : 'missed';
    } catch {
      /* No transport errors/payloads in timer history. */
    }
    this.engine.finish(job.timer.id, this.channel, result, 'attempting');
    if (gen === this.generation) {
      this.inFlight = null;
      this.pump();
    }
  }
}
export class TimerEngine {
  readonly store;
  discord: (() => TimerTransport | null) | undefined;
  private rustQueue = new NoticeQueue(this, 'rust');
  private discordQueue = new NoticeQueue(this, 'discord');
  private interval: ReturnType<typeof setInterval>;
  private closed = false;
  private error = '';
  private profileEpoch: number;
  constructor(
    private service: LiveService,
    readonly now: () => number,
  ) {
    this.profileEpoch = service.profileEpoch;
    this.store = service.db.timers;
    this.store.recover(now());
    this.interval = setInterval(() => this.tick(), 1000);
    this.interval.unref();
    service.on('sessionLost', this.sessionLost);
  }
  private sessionLost = () => {
    this.rustQueue.clear();
    if (this.profileEpoch !== this.service.profileEpoch) {
      this.discordQueue.clear();
      this.profileEpoch = this.service.profileEpoch;
    }
  };
  dropDiscord() {
    this.discordQueue.clear();
  }
  changed() {
    if (!this.closed) this.service.changed();
  }
  snapshot() {
    try {
      return {
        timers: this.store.list(this.service.config.activeProfileId),
        timerError: this.error,
      };
    } catch {
      return { timers: [], timerError: 'Timerlagringen kunde inte läsas. Försök igen.' };
    }
  }
  attempt(id: string, channel: TimerChannel) {
    if (this.closed) return false;
    try {
      return this.store.attempt(id, channel);
    } catch {
      this.error = 'Timerns sändningsförsök kunde inte sparas. Ingen avisering skickades.';
      this.finish(id, channel, 'missed', 'pending');
      return false;
    }
  }
  finish(
    id: string,
    channel: TimerChannel,
    result: TimerDelivery,
    expected: 'pending' | 'attempting',
  ) {
    if (this.closed) return;
    try {
      this.store.finish(id, channel, result, expected);
      this.changed();
    } catch {
      this.error = 'Timerleveransen kunde inte sparas.';
      this.changed();
    }
  }
  private profile() {
    const p = this.service.config.profiles.find(
      (p) => p.id === this.service.config.activeProfileId,
    );
    insist(p, 'Välj en serverprofil först.');
    return p;
  }
  private actor(actor?: { steamId: string; name: string }) {
    const p = this.profile();
    if (actor)
      insist(
        this.service.connection === 'connected' &&
          this.service.teamUpdatedAt !== null &&
          this.service.team.some((m) => m.steamId === actor.steamId),
        'Du finns inte i det aktuella teamet.',
      );
    return {
      profile: p,
      id: actor?.steamId || p.playerId,
      name: plainText(actor?.name || 'Webbpanelen', 40),
      admin: !actor || actor.steamId === p.playerId || !!p.controlSteamIds?.includes(actor.steamId),
    };
  }
  create(body: unknown, actor?: { steamId: string; name: string }) {
    const b = object(body),
      a = this.actor(actor),
      name = plainText(text(b.name, 60), 60);
    insist(name, 'Ange ett namn på timern.');
    let ms: number;
    try {
      ms = parseTimerDuration(b.duration);
    } catch (e) {
      throw new UserError((e as Error).message);
    }
    const now = this.now(),
      timer = this.store.create({
        profileId: a.profile.id,
        name,
        creatorId: a.id,
        creatorName: a.name,
        createdAt: now,
        dueAt: now + ms,
      });
    this.changed();
    return timer;
  }
  cancel(id: string, actor?: { steamId: string; name: string }) {
    const a = this.actor(actor),
      timer = this.store.cancel(a.profile.id, text(id, 36), a.id, a.admin, this.now());
    this.changed();
    return timer;
  }
  command(command: string, arg: string, actor: { steamId: string; name: string }) {
    if (command === 'timers' || !arg) return this.listChat(command === 'timers' ? arg : '');
    const add = /^add\s+(\S+)\s+(.+)$/i.exec(arg);
    if (add) {
      const t = this.create({ duration: add[1], name: add[2] }, actor);
      return `Timer ${t.shortId}: ${t.name} · ${timerRemaining(t.dueAt - this.now())}.`;
    }
    const cancel = /^cancel\s+(\S+)$/i.exec(arg);
    if (cancel) {
      const t = this.cancel(cancel[1], actor);
      return `Timer ${t.shortId} avbruten: ${t.name}.`;
    }
    throw new UserError('Syntax: !timer add 15m Namn · !timer cancel ID · !timers [sida]');
  }
  private listChat(arg: string) {
    const p = this.profile();
    insist(!arg || /^[1-9]\d*$/.test(arg), 'Ange ett positivt sidnummer.');
    const rows = this.store.list(p.id).filter((t) => t.state === 'active' && t.dueAt > this.now()),
      pages = Math.max(1, Math.ceil(rows.length / 5)),
      page = Number(arg || 1);
    insist(page <= pages, 'Den sidan finns inte.');
    if (!rows.length) return 'Inga aktiva timers för servern.';
    return (
      rows
        .slice((page - 1) * 5, page * 5)
        .map(
          (t) =>
            `${t.shortId}: ${[...t.name].length > 40 ? [...t.name].slice(0, 39).join('') + '…' : t.name} (${timerRemaining(t.dueAt - this.now())})`,
        )
        .join(' · ') + ` · Sida ${page}/${pages}${page < pages ? ' · !timers ' + (page + 1) : ''}`
    );
  }
  private rust(): TimerTransport | null {
    if (this.service.connection !== 'connected') return null;
    const { adapter, gen, profileId } = this.service.liveSession();
    const valid = () =>
      this.service.isLiveSession(gen) && this.service.config.activeProfileId === profileId;
    return {
      valid,
      send: async (t) => {
        if (!valid()) return false;
        await adapter.chat(plainText(`[ElRusty] Timer klar: ${t.name} (${t.shortId}).`, 120));
        return true;
      },
    };
  }
  tick() {
    if (this.closed) return;
    try {
      const rust = this.rust(),
        discord = this.discord?.() || null;
      const rows = this.store.claimDue(
        this.now(),
        this.service.config.activeProfileId,
        !!rust,
        !!discord,
      );
      for (const timer of rows) {
        if (timer.rust === 'pending' && rust) this.rustQueue.push({ timer, transport: rust });
        if (timer.discord === 'pending' && discord)
          this.discordQueue.push({ timer, transport: discord });
      }
      if (rows.length) this.changed();
    } catch {
      this.error = 'Timers kunde inte uppdateras. Kontrollera lokal lagring.';
      this.changed();
    }
  }
  close() {
    if (this.closed) return;
    clearInterval(this.interval);
    this.service.off('sessionLost', this.sessionLost);
    this.rustQueue.clear(true);
    this.discordQueue.clear(true);
    this.closed = true;
  }
}
