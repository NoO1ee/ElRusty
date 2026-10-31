import RustPlus from '@liamcottle/rustplus.js';
import { EventEmitter } from 'node:events';
import type { PrivateProfile } from './db.ts';
import type { Entity, Member } from '../shared/live.ts';
export interface ChatMessage {
  steamId: string;
  message: string;
  time: number;
}
export interface RustAdapter extends EventEmitter {
  open(): Promise<void>;
  close(): void;
  info(): Promise<void>;
  team(): Promise<Member[]>;
  entity(id: number): Promise<Entity>;
  set(id: number, value: boolean): Promise<void>;
  time(): Promise<number>;
  chat(message: string): Promise<void>;
}
export function normalizeEntity(raw: any): Entity {
  const types = { 1: 'switch', 2: 'alarm', 3: 'storage' } as const;
  const type = types[raw?.type as keyof typeof types];
  if (!type || !raw.payload) throw new Error('Ogiltig enhet');
  return {
    type,
    value: !!raw.payload.value,
    items: raw.payload.items?.map((i: any) => ({ itemId: i.itemId, quantity: i.quantity })),
  };
}
export class RustConnection extends EventEmitter implements RustAdapter {
  private client: any;
  private stopped = false;
  private waiting = new Set<(reason: Error) => void>();
  constructor(profile: PrivateProfile) {
    super();
    this.client = new RustPlus(
      profile.host,
      profile.port,
      profile.playerId,
      profile.playerToken,
      profile.useProxy,
    );
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new Error('Anslutningen tog för lång tid.'));
      }, 12000);
      const cancel = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.waiting.add(cancel);
      const complete = () => {
        clearTimeout(timer);
        this.waiting.delete(cancel);
      };
      this.client.on('connected', () => {
        complete();
        if (this.stopped) {
          this.client.disconnect();
          return;
        }
        resolve();
      });
      this.client.on('error', () => {
        complete();
        reject(new Error('Kunde inte ansluta.'));
        this.emit('lost');
      });
      this.client.on('disconnected', () => {
        complete();
        reject(new Error('Frånkopplad.'));
        if (!this.stopped) this.emit('lost');
      });
      this.client.on('message', (m: any) => {
        if (this.stopped) return;
        const b = m.broadcast;
        if (b?.entityChanged) {
          try {
            this.emit('entity', Number(b.entityChanged.entityId), b.entityChanged.payload);
          } catch {
            /* Ignore malformed broadcasts. */
          }
        }
        if (b?.teamChanged) this.emit('teamChanged');
        if (b?.teamMessage?.message) {
          const x = b.teamMessage.message;
          this.emit('chat', {
            steamId: String(x.steamId),
            message: String(x.message),
            time: Number(x.time),
          } satisfies ChatMessage);
        }
      });
      this.client.connect();
    });
  }
  private request(data: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.stopped || !this.client.websocket || !this.client.isConnected()) {
        reject(new Error('Frånkopplad.'));
        return;
      }
      let seq = 0;
      const done = () => {
        clearTimeout(timer);
        this.waiting.delete(cancel);
        if (seq) delete this.client.seqCallbacks[seq];
      };
      const cancel = (e: Error) => {
        done();
        reject(e);
      };
      const timer = setTimeout(() => cancel(new Error('Rust+ svarade inte i tid.')), 8000);
      this.waiting.add(cancel);
      try {
        seq = this.client.seq + 1;
        this.client.sendRequest(data, (m: any) => {
          done();
          if (m.response?.error)
            reject(new Error('Rust+ nekade begäran. Kontrollera parning och behörighet.'));
          else resolve(m.response);
          return true;
        });
      } catch {
        cancel(new Error('Kunde inte skicka begäran.'));
      }
    });
  }
  close() {
    this.stopped = true;
    for (const cancel of [...this.waiting]) cancel(new Error('Frånkopplad.'));
    this.client.disconnect();
  }
  async info() {
    const r = await this.request({ getInfo: {} });
    if (!r.info) throw new Error('Ingen serverinformation.');
  }
  async team() {
    const r = await this.request({ getTeamInfo: {} });
    if (!r.teamInfo) throw new Error('Team saknas.');
    return (r.teamInfo.members || []).map((m: any) => ({
      steamId: String(m.steamId),
      name: String(m.name),
      isOnline: !!m.isOnline,
      isAlive: !!m.isAlive,
    }));
  }
  async entity(id: number) {
    return normalizeEntity((await this.request({ entityId: id, getEntityInfo: {} })).entityInfo);
  }
  async set(id: number, value: boolean) {
    await this.request({ entityId: id, setEntityValue: { value } });
  }
  async time() {
    return Number((await this.request({ getTime: {} })).time?.time);
  }
  async chat(message: string) {
    await this.request({ sendTeamMessage: { message } });
  }
}
