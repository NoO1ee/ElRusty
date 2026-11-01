import { pairingFailureMessage } from './pairing-errors.ts';
import { entityNotification, type EntityPairing } from './device-notification.ts';
import { fork, execFile, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LiveService } from './service.ts';
import { profile, insist } from './validation.ts';
import type { PrivateProfile } from './db.ts';
import type { PairingStatus, DevicePairingCandidate } from '../shared/live.ts';
type StartWorker = (action: 'register' | 'listen', file: string) => ChildProcess;
const startWorker: StartWorker = (action, file) =>
  fork(fileURLToPath(new URL('./pairing-worker.ts', import.meta.url)), [action, file], {
    execArgv: ['--experimental-transform-types'],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
export class PairingManager {
  private child: ChildProcess | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private sweep: ReturnType<typeof setInterval> | undefined;
  private retries = 0;
  private automatic = false;
  private generation = 0;
  private registering = false;
  private candidates = new Map<string, { profile: PrivateProfile; expires: number }>();
  private devices = new Map<string, DevicePairingCandidate>();
  private accepting = new Set<string>();
  readonly configFile: string;
  constructor(
    private service: LiveService,
    dataDir: string,
    private spawn: StartWorker = startWorker,
    private canRegister = process.platform === 'win32' ||
      process.platform === 'darwin' ||
      !!process.env.DISPLAY,
  ) {
    this.configFile = resolve(dataDir, 'rustplus.config.json');
    this.publish({
      status: 'idle',
      message: 'Registrera Rust+ för att ta emot parningar.',
      candidates: [],
    });
  }
  private registered() {
    try {
      const c = JSON.parse(readFileSync(this.configFile, 'utf8'));
      return !!(c.fcm_credentials?.gcm?.androidId && c.fcm_credentials?.gcm?.securityToken);
    } catch {
      return false;
    }
  }
  private publish(patch: Partial<PairingStatus>) {
    const now = Date.now();
    for (const [id, c] of this.candidates) if (c.expires <= now) this.candidates.delete(id);
    for (const [id, c] of this.devices)
      if (c.expiresAt <= now || !this.service.config.profiles.some((p) => p.id === c.profileId))
        this.devices.delete(id);
    this.service.pairing = {
      ...this.service.pairing,
      ...patch,
      hasRegistration: this.registered(),
      candidates: [...this.candidates].map(([id, { profile: p, expires }]) => ({
        id,
        name: p.name,
        host: p.host,
        port: p.port,
        expiresAt: expires,
      })),
      devices: [...this.devices.values()],
    };
    this.service.changed();
  }
  enable() {
    insist(!this.registering, 'Registreringen pågår redan.');
    this.automatic = true;
    this.retries = 0;
    clearTimeout(this.retry);
    this.sweep ??= setInterval(() => this.publish({}), 30000);
    this.sweep.unref();
    if (this.child) return;
    if (this.registered()) this.start('listen');
    else
      this.publish({
        status: 'idle',
        running: false,
        message: 'Registrera Rust+ för att starta automatisk mottagning.',
      });
  }
  async register() {
    insist(!this.registering, 'Registreringen pågår redan.');
    insist(this.canRegister, 'Inloggningen behöver ett skrivbord med Brave, Chrome eller Edge.');
    this.registering = true;
    try {
      await this.cancel();
      this.automatic = true;
      this.start('register');
    } finally {
      this.registering = false;
    }
  }
  private schedule(action: 'register' | 'listen', success = false) {
    if (!this.automatic || !this.registered() || (action === 'register' && !success)) return;
    const gen = this.generation,
      delay = action === 'register' ? 0 : Math.min(30000, 1000 * 2 ** Math.min(this.retries++, 5));
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (gen === this.generation && this.automatic && !this.child) this.start('listen');
    }, delay);
    this.retry.unref();
  }
  start(action: 'register' | 'listen') {
    insist(!this.child, 'Ett parningssteg körs redan. Avbryt det först.');
    insist(action !== 'listen' || this.registered(), 'Registrera Rust+ innan du börjar lyssna.');
    insist(
      action !== 'register' || this.canRegister,
      'Inloggningen behöver ett skrivbord med Brave, Chrome eller Edge. Registrera på datorn och flytta den privata konfigurationen till Pi:n.',
    );
    clearTimeout(this.retry);
    clearTimeout(this.timer);
    if (this.automatic) {
      this.sweep ??= setInterval(() => this.publish({}), 30000);
      this.sweep.unref();
    }
    const gen = ++this.generation;
    if (!this.automatic) {
      this.candidates.clear();
      this.devices.clear();
    }
    this.publish({
      status: action === 'register' ? 'registering' : 'listening',
      running: true,
      message:
        action === 'register'
          ? 'Förbereder Rust+-registreringen…'
          : 'Ansluter till Rust+ notistjänst…',
      warning: undefined,
    });
    let child: ChildProcess;
    try {
      child = this.spawn(action, this.configFile);
      this.child = child;
    } catch {
      this.publish({
        status: 'error',
        running: false,
        message: 'Kunde inte starta parningen. Försöker igen när mottagningen är aktiverad.',
      });
      this.schedule(action);
      return;
    }
    let complete = false,
      success = false;
    child.on('message', (raw: any) => {
      if (gen !== this.generation || this.child !== child) return;
      if (raw?.type === 'stage' && typeof raw.text === 'string' && raw.text.length < 300)
        this.publish({ message: raw.text });
      if (raw?.type === 'warning' && raw.code === 'browser-cleanup')
        this.publish({
          warning:
            'Tillfälliga inloggningsfiler kunde inte tas bort. De ligger kvar i den privata datakatalogen. Registreringen kan fortsätta.',
        });
      if (raw?.type === 'registered') {
        complete = true;
        success = true;
        this.publish({
          status: 'registered',
          message: 'Rust+ är registrerat. Mottagningen startas automatiskt.',
        });
      }
      if (raw?.type === 'failed') {
        complete = true;
        this.publish({ status: 'error', message: pairingFailureMessage(raw, action) });
      }
      if (raw?.type === 'device' && action === 'listen') {
        const d = entityNotification({ body: { ...raw.device, type: 'entity' } });
        if (d) this.receiveDevice(d);
      }
      if (raw?.type === 'candidate' && action === 'listen') {
        try {
          const p = profile({ ...raw.server, playerToken: Number(raw.server.playerToken) });
          this.publish({});
          const duplicate = [...this.candidates].find(
            ([, c]) =>
              c.profile.host === p.host &&
              c.profile.port === p.port &&
              c.profile.playerId === p.playerId,
          );
          if (!duplicate && this.candidates.size >= 20) return;
          this.candidates.set(duplicate?.[0] || crypto.randomUUID(), {
            profile: p,
            expires: Date.now() + 15 * 60000,
          });
          this.publish({
            message: 'Serverparning mottagen. Kontrollera servern och välj Lägg till och anslut.',
          });
        } catch {
          /* Invalid private data is never exposed. */
        }
      }
    });
    child.once('error', () => {
      if (this.child !== child || gen !== this.generation) return;
      this.child = null;
      clearTimeout(this.timer);
      this.publish({
        status: 'error',
        running: false,
        message: 'Parningsprocessen kunde inte startas.',
      });
      this.schedule(action);
    });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      clearTimeout(this.timer);
      if (gen !== this.generation) return;
      this.publish(
        !complete
          ? {
              status: 'error',
              message: 'Parningen avslutades. Mottagningen försöker igen om den är aktiverad.',
              running: false,
            }
          : { running: false },
      );
      this.schedule(action, success);
    });
    if (action === 'register' || !this.automatic) {
      this.timer = setTimeout(
        () => void this.cancel('Tiden för parning gick ut. Du kan starta igen.'),
        action === 'register' ? 5 * 60000 : 10 * 60000,
      );
      this.timer.unref();
    }
  }
  private receiveDevice(d: EntityPairing) {
    this.publish({});
    const matches = this.service.config.profiles.filter(
      (p) => p.host === d.ip && p.port === d.port && (!d.playerId || p.playerId === d.playerId),
    );
    if (matches.length !== 1) {
      this.publish({
        warning:
          'En enhetsparning kunde inte kopplas till exakt en sparad serverprofil. Para servern först; inga enheter lades till.',
      });
      return;
    }
    const profileId = matches[0].id;
    if (
      this.service.config.devices.some(
        (c) => c.profileId === profileId && c.entityId === d.entityId,
      )
    )
      return;
    const existing = [...this.devices.values()].find(
      (c) => c.profileId === profileId && c.entityId === d.entityId,
    );
    if (!existing && this.devices.size >= 20) return;
    const candidate: DevicePairingCandidate = {
      id: existing?.id || crypto.randomUUID(),
      profileId,
      entityId: d.entityId,
      entityType: d.entityType,
      name: d.entityName,
      expiresAt: Date.now() + 15 * 60000,
    };
    this.devices.set(candidate.id, candidate);
    this.publish({ message: 'Enhetsparning mottagen. Öppna Live → Enheter och välj Lägg till.' });
  }
  async acceptDevice(id: string) {
    const d = this.devices.get(id);
    insist(d && d.expiresAt > Date.now(), 'Enhetsförslaget har gått ut. Para enheten igen.');
    insist(
      d.profileId === this.service.config.activeProfileId &&
        this.service.connection === 'connected',
      'Anslut till förslagets serverprofil först.',
    );
    insist(!this.accepting.has(id), 'Enheten verifieras redan.');
    this.accepting.add(id);
    try {
      const type = ({ 1: 'switch', 2: 'alarm', 3: 'storage' } as const)[d.entityType];
      const device = await this.service.addDevice(
        { entityId: d.entityId, name: d.name, group: '' },
        type,
      );
      this.devices.delete(id);
      this.publish({ message: 'Enheten verifierades och lades till. Mottagningen fortsätter.' });
      return { id: device.id };
    } finally {
      this.accepting.delete(id);
    }
  }
  async cancel(message = 'Parningen avbröts.') {
    this.automatic = false;
    this.generation++;
    clearTimeout(this.retry);
    clearTimeout(this.timer);
    clearInterval(this.sweep);
    this.sweep = undefined;
    const child = this.child;
    this.candidates.clear();
    this.devices.clear();
    this.publish({ status: 'idle', message });
    if (!child) {
      this.publish({ running: false });
      return;
    }
    await new Promise<void>((resolve) => {
      const kill = setTimeout(() => {
        if (process.platform === 'win32' && child.pid)
          execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () =>
            resolve(),
          );
        else {
          child.kill('SIGKILL');
          resolve();
        }
      }, 8000);
      kill.unref();
      child.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      if (child.connected) child.send({ type: 'stop' }, () => {});
      else child.kill();
    });
    if (this.child === child) this.child = null;
    this.publish({ running: false });
  }
  async accept(id: string) {
    const c = this.candidates.get(id);
    insist(c && c.expires > Date.now(), 'Serverparningen har gått ut. Para servern igen.');
    const p = c.profile,
      existing = this.service.config.profiles.find(
        (x) => x.host === p.host && x.port === p.port && x.playerId === p.playerId,
      );
    const profileId = this.service.saveProfile(p, existing?.id);
    if (this.automatic) {
      this.candidates.delete(id);
      this.publish({ message: 'Servern har lagts till. Mottagningen fortsätter.' });
    } else await this.cancel('Servern har lagts till. Kontrollerar Rust+-anslutningen…');
    this.service.connect(profileId);
    return { id: profileId };
  }
  async close() {
    await this.cancel();
  }
}
