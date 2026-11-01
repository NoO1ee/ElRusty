import type { LiveService } from './service.ts';
import type { ChatMessage, RustAdapter } from './rust.ts';
import type { TeamChatLine } from '../shared/live.ts';
import { plainText } from './chat.ts';
import { object, text, insist } from './validation.ts';
interface Job {
  line: TeamChatLine;
  adapter: RustAdapter;
  gen: number;
  profileId: string;
  attemptAt?: number;
}
interface Buffer {
  wipeKey: string;
  lines: TeamChatLine[];
  seen: Set<string>;
  clients: Map<string, string>;
}
export class TeamChat {
  private attempted = new WeakSet<TeamChatLine>();
  private buffers = new Map<string, Buffer>();
  private profileId: string | null = null;
  private jobs: Job[] = [];
  private inFlight: Job | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextAt = 0;
  constructor(private service: LiveService) {
    service.on('sessionLost', this.stop);
  }
  start(profileId: string, wipeKey: string) {
    this.stop();
    this.profileId = profileId;
    if (this.buffers.get(profileId)?.wipeKey !== wipeKey)
      this.buffers.set(profileId, { wipeKey, lines: [], seen: new Set(), clients: new Map() });
    const { adapter, gen } = this.service.liveSession();
    if (adapter.chatHistory)
      void adapter
        .chatHistory()
        .then((rows) => {
          if (this.profileId !== profileId || !this.service.isLiveSession(gen)) return;
          for (const row of rows) this.receive(row, true);
          this.service.changed();
        })
        .catch(() => {});
  }
  snapshot() {
    return this.profileId
      ? this.buffers.get(this.profileId)?.lines || []
      : this.service.config.activeProfileId
        ? this.buffers.get(this.service.config.activeProfileId)?.lines || []
        : [];
  }
  deleteProfile(id: string) {
    this.buffers.delete(id);
  }
  receive(raw: ChatMessage, history = false) {
    const id = this.service.config.activeProfileId,
      b = id ? this.buffers.get(id) : undefined;
    if (
      !b ||
      !/^\d{17}$/.test(raw.steamId) ||
      !Number.isFinite(raw.time) ||
      typeof raw.message !== 'string'
    )
      return;
    const message = plainText(raw.message, 500),
      at = raw.time * 1000,
      key = JSON.stringify([raw.steamId, raw.time, message]);
    if (!message || b.seen.has(key)) return;
    b.seen.add(key);
    if (b.seen.size > 1000) b.seen.delete(b.seen.values().next().value!);
    const echo = [...b.lines]
      .reverse()
      .find(
        (l) =>
          l.origin === 'web' &&
          this.attempted.has(l) &&
          l.steamId === raw.steamId &&
          l.text === message &&
          Math.abs(l.at - at) < 45000,
      );
    if (echo) {
      echo.status = 'sent';
      echo.at = at;
      this.service.changed();
      return;
    }
    const name =
      this.service.team.find((m) => m.steamId === raw.steamId)?.name || raw.name || 'Spelare';
    b.lines.push({
      id: crypto.randomUUID(),
      steamId: raw.steamId,
      name: plainText(name, 60),
      text: message,
      at,
      origin: history ? 'history' : 'rust',
      status: 'received',
    });
    this.trim(b);
    this.service.changed();
  }
  private trim(b: Buffer) {
    b.lines.sort((a, c) => a.at - c.at);
    if (b.lines.length > 100) b.lines.splice(0, b.lines.length - 100);
    while (b.clients.size > 1000) b.clients.delete(b.clients.keys().next().value!);
  }
  send(body: unknown) {
    const input = object(body),
      clientId = text(input.clientId, 64);
    insist(/^[a-z0-9-]{8,64}$/i.test(clientId), 'Ogiltigt meddelande-ID.');
    const { adapter, gen, profileId } = this.service.liveSession(),
      b = this.buffers.get(profileId!);
    insist(b && this.profileId === profileId, 'Lagchatten är inte redo.');
    const owner = this.service.config.profiles.find((p) => p.id === profileId)?.playerId;
    const member = this.service.team.find((m) => m.steamId === owner);
    insist(
      member && this.service.teamUpdatedAt !== null,
      'Det parade kontot måste finnas i aktuellt team.',
    );
    const existing = b.clients.get(clientId);
    if (existing) return { id: existing };
    insist(this.jobs.length + (this.inFlight ? 1 : 0) < 20, 'Chattkön är full. Försök senare.');
    const value = plainText(text(input.text, 113), 113);
    insist(value, 'Skriv ett meddelande.');
    const line: TeamChatLine = {
      id: clientId,
      steamId: member.steamId,
      name: plainText(member.name, 60),
      text: '[Webb] ' + value,
      at: Date.now(),
      origin: 'web',
      status: 'pending',
    };
    b.lines.push(line);
    b.clients.set(clientId, line.id);
    this.trim(b);
    this.jobs.push({ line, adapter, gen, profileId: profileId! });
    this.service.changed();
    this.pump();
    return { id: clientId };
  }
  private pump() {
    if (this.timer || this.inFlight || !this.jobs.length) return;
    const wait = Math.max(0, this.nextAt - performance.now());
    if (wait) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, wait);
      return;
    }
    const job = this.jobs.shift()!,
      generation = this.generation;
    if (
      !this.service.isLiveSession(job.gen) ||
      this.service.config.activeProfileId !== job.profileId
    ) {
      job.line.status = 'failed';
      this.service.changed();
      this.pump();
      return;
    }
    this.inFlight = job;
    this.attempted.add(job.line);
    job.line.at = Date.now();
    this.nextAt = performance.now() + 1000;
    void job.adapter
      .chat(job.line.text)
      .then(() => {
        if (generation === this.generation) job.line.status = 'sent';
      })
      .catch(() => {
        if (generation === this.generation && job.line.status !== 'sent')
          job.line.status = 'unconfirmed';
      })
      .finally(() => {
        if (generation === this.generation) {
          this.inFlight = null;
          this.service.changed();
          this.pump();
        }
      });
  }
  stop = () => {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const job of this.jobs.splice(0)) job.line.status = 'failed';
    if (this.inFlight?.line.status === 'pending') this.inFlight.line.status = 'unconfirmed';
    this.inFlight = null;
    this.profileId = null;
  };
  close() {
    this.stop();
    this.service.off('sessionLost', this.stop);
  }
}
