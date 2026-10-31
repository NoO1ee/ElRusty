import { fork, execFile, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LiveService } from './service.ts';
import { profile, insist } from './validation.ts';
import type { PrivateProfile } from './db.ts';
import type { PairingStatus } from '../shared/live.ts';
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
  private generation = 0;
  private candidates = new Map<string, { profile: PrivateProfile; expires: number }>();
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
      message: 'Registrera Rust+ för att ta emot serverparningar.',
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
    this.service.pairing = {
      ...this.service.pairing,
      ...patch,
      hasRegistration: this.registered(),
    };
    this.service.changed();
  }
  start(action: 'register' | 'listen') {
    insist(!this.child, 'Ett parningssteg körs redan. Avbryt det först.');
    insist(action !== 'listen' || this.registered(), 'Registrera Rust+ innan du börjar lyssna.');
    insist(
      action !== 'register' || this.canRegister,
      'Inloggningen behöver ett skrivbord med Brave, Chrome eller Edge. Registrera på datorn och flytta den privata konfigurationen till Pi:n.',
    );
    const gen = ++this.generation;
    this.candidates.clear();
    this.publish({
      status: action === 'register' ? 'registering' : 'listening',
      running: true,
      message:
        action === 'register'
          ? 'Förbereder Rust+-registreringen…'
          : 'Ansluter till Rust+ notistjänst…',
      candidates: [],
    });
    let child: ChildProcess;
    try {
      child = this.spawn(action, this.configFile);
      this.child = child;
    } catch {
      this.publish({
        status: 'error',
        running: false,
        message: 'Kunde inte starta parningen. Försök igen.',
      });
      return;
    }
    let complete = false;
    child.on('message', (raw: any) => {
      if (gen !== this.generation || this.child !== child) return;
      // Only fixed progress messages cross the worker boundary; no raw stdout is relayed.
      if (raw?.type === 'stage' && typeof raw.text === 'string' && raw.text.length < 300)
        this.publish({ message: raw.text });
      if (raw?.type === 'registered') {
        complete = true;
        this.publish({
          status: 'registered',
          message: 'Rust+ är registrerat. Fortsätt med Vänta på server.',
        });
      }
      if (raw?.type === 'failed') {
        complete = true;
        this.publish({
          status: 'error',
          message:
            action === 'register'
              ? 'Registreringen misslyckades. Kontrollera internet och att Brave, Chrome eller Edge finns. Försök igen; tidigare registrering behålls.'
              : 'Kunde inte lyssna på Rust+. Kontrollera anslutningen eller registrera på nytt.',
        });
      }
      if (raw?.type === 'candidate' && action === 'listen') {
        try {
          const p = profile({ ...raw.server, playerToken: Number(raw.server.playerToken) });
          const duplicate = [...this.candidates].find(
            ([, c]) =>
              c.profile.host === p.host &&
              c.profile.port === p.port &&
              c.profile.playerId === p.playerId,
          );
          if (!duplicate && this.candidates.size >= 20) return;
          const id = duplicate?.[0] || crypto.randomUUID();
          this.candidates.set(id, { profile: p, expires: Date.now() + 15 * 60_000 });
          this.publish({
            message: 'Serverparning mottagen. Kontrollera servern och välj Lägg till och anslut.',
            candidates: [...this.candidates].map(([id, { profile: p, expires }]) => ({
              id,
              name: p.name,
              host: p.host,
              port: p.port,
              expiresAt: expires,
            })),
          });
        } catch {
          /* Non-server notifications are ignored. */
        }
      }
    });
    child.once('error', () => {
      if (this.child === child) {
        this.child = null;
        clearTimeout(this.timer);
      }
      if (gen === this.generation)
        this.publish({
          status: 'error',
          running: false,
          message: 'Parningsprocessen kunde inte startas.',
        });
    });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      clearTimeout(this.timer);
      if (gen === this.generation && !complete)
        this.publish({
          status: 'error',
          message: 'Parningen avslutades. Försök igen.',
          running: false,
        });
      else this.publish({ running: false });
    });
    this.timer = setTimeout(
      () => {
        void this.cancel('Tiden för parning gick ut. Du kan starta igen.');
      },
      action === 'register' ? 5 * 60_000 : 10 * 60_000,
    );
  }
  async cancel(message = 'Parningen avbröts.') {
    const child = this.child;
    this.generation++;
    clearTimeout(this.timer);
    this.candidates.clear();
    this.publish({ status: 'idle', message, candidates: [] });
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
    const candidate = this.candidates.get(id);
    insist(
      candidate && candidate.expires > Date.now(),
      'Serverparningen har gått ut. Para servern igen.',
    );
    const p = candidate.profile,
      existing = this.service.config.profiles.find(
        (x) => x.host === p.host && x.port === p.port && x.playerId === p.playerId,
      );
    const profileId = this.service.saveProfile(p, existing?.id);
    await this.cancel('Servern har lagts till. Kontrollerar Rust+-anslutningen…');
    this.service.connect(profileId);
    return { id: profileId };
  }
  async close() {
    await this.cancel();
  }
}
