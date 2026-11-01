import { TimerStore } from './timer-store.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Profile, Device, Mode, DiscordConfig, Activity } from '../shared/live.ts';
export interface PrivateProfile extends Profile {
  playerToken: number;
}
export interface Config {
  timeCalibrations?: Record<string, import('../shared/time.ts').SavedTimeCalibration>;
  deathLocations?: Record<string, import('../shared/team-map.ts').LastDeath>;
  profiles: PrivateProfile[];
  devices: Device[];
  modes: Mode[];
  activeProfileId: string | null;
  discord: DiscordConfig & { token: string; enabled?: boolean };
}
const empty = (): Config => ({
  profiles: [],
  devices: [],
  modes: [],
  activeProfileId: null,
  discord: { guildId: '', channelId: '', userIds: [], roleIds: [], token: '' },
});
export class LiveDB {
  sql: DatabaseSync;
  timers: TimerStore;
  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.sql = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.sql.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, at INTEGER NOT NULL, json TEXT NOT NULL);',
    );
    this.timers = new TimerStore(this.sql);
  }
  load(): Config {
    const row = this.sql.prepare('SELECT json FROM config WHERE id=1').get() as
      { json: string } | undefined;
    return row ? JSON.parse(row.json) : empty();
  }
  save(config: Config) {
    this.sql
      .prepare('INSERT INTO config VALUES (1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json')
      .run(JSON.stringify(config));
  }
  log(entry: Activity) {
    this.sql
      .prepare('INSERT INTO activity VALUES (?,?,?)')
      .run(entry.id, entry.at, JSON.stringify(entry));
    this.sql.exec(
      'DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY at DESC LIMIT 500)',
    );
  }
  history(): Activity[] {
    return (
      this.sql.prepare('SELECT json FROM activity ORDER BY at DESC LIMIT 100').all() as {
        json: string;
      }[]
    ).map((r) => JSON.parse(r.json));
  }
  close() {
    this.sql.close();
  }
}
