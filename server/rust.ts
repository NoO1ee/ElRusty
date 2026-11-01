import { normalizeTeamInfo } from './team-info.ts';
import type { TeamMapNote } from '../shared/team-map.ts';
import type { ServerInfo, MapData, MapMarker } from '../shared/world.ts';
import RustPlus from '@liamcottle/rustplus.js';
import { EventEmitter } from 'node:events';
import type { PrivateProfile } from './db.ts';
import type { Entity, Member } from '../shared/live.ts';
export interface ChatMessage {
  steamId: string;
  message: string;
  time: number;
  name?: string;
}
export interface RustAdapter extends EventEmitter {
  open(): Promise<void>;
  close(): void;
  info(): Promise<void | ServerInfo>;
  map?(): Promise<MapData>;
  markers?(): Promise<MapMarker[]>;
  promote?(steamId: string): Promise<void>;
  team(): Promise<Member[]>;
  teamNotes?(): TeamMapNote[];
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
  private notes: TeamMapNote[] = [];
  private playerId: string;
  teamNotes() {
    return this.notes;
  }
  private stopped = false;
  private waiting = new Set<(reason: Error) => void>();
  constructor(profile: PrivateProfile) {
    super();
    this.playerId = profile.playerId;
    this.client = new RustPlus(
      profile.connectionHost || profile.host,
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
      this.client.on('error', (error: { code?: string; field?: string }) => {
        if (this.stopped) return;
        complete();
        reject(new Error('Kunde inte ansluta.'));
        this.close();
        if (
          error?.code === 'ELRUSTY_PROTOCOL' &&
          typeof error.field === 'string' &&
          /^rustplus\.[A-Za-z0-9_.]{1,120}$/.test(error.field)
        )
          this.emit('lost', 'protocol', error.field);
        else this.emit('lost', error?.code === 'ELRUSTY_PROTOCOL' ? 'protocol' : undefined);
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
            name: String(x.name || 'Spelare'),
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
    const i = r.info;
    return {
      name: String(i.name),
      mapSize: Number(i.mapSize),
      wipeTime: Number(i.wipeTime),
      seed: Object.hasOwn(i, 'seed') ? Number(i.seed) : undefined,
      players: Number(i.players ?? 0),
      maxPlayers: Number(i.maxPlayers ?? 0),
      ...(Object.hasOwn(i, 'queuedPlayers') ? { queuedPlayers: Number(i.queuedPlayers) } : {}),
    } satisfies ServerInfo;
  }
  async team() {
    const r = await this.request({ getTeamInfo: {} });
    if (!r.teamInfo) throw new Error('Team saknas.');
    const normalized = normalizeTeamInfo(r.teamInfo, this.playerId);
    this.notes = normalized.notes;
    return normalized.members;
  }
  async map(): Promise<MapData> {
    const r = await this.request({ getMap: {} });
    if (!r.map) throw Error('Karta saknas.');
    return {
      width: Number(r.map.width),
      height: Number(r.map.height),
      oceanMargin: Number(r.map.oceanMargin),
      jpgImage: new Uint8Array(r.map.jpgImage),
      monuments: (r.map.monuments || [])
        .filter((m: any) => Number.isFinite(m.x) && Number.isFinite(m.y))
        .map((m: any) => ({ token: String(m.token), x: Number(m.x), y: Number(m.y) })),
    };
  }
  async markers(): Promise<MapMarker[]> {
    const r = await this.request({ getMapMarkers: {} });
    if (!r.mapMarkers) throw Error('Markörer saknas.');
    return (r.mapMarkers.markers || [])
      .filter(
        (m: any) =>
          [2, 3, 4, 5, 6, 8].includes(m.type) && Number.isFinite(m.x) && Number.isFinite(m.y),
      )
      .map((m: any) => ({
        id: Number(m.id),
        type: Number(m.type),
        x: Number(m.x),
        y: Number(m.y),
        name: m.name ? String(m.name) : '',
        outOfStock: Object.hasOwn(m, 'outOfStock') ? !!m.outOfStock : undefined,
      }));
  }
  async promote(steamId: string) {
    await this.request({ promoteToLeader: { steamId } });
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
