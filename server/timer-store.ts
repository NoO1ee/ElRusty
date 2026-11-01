import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { LiveTimer, TimerChannel, TimerDelivery } from '../shared/timers.ts';
import { insist } from './validation.ts';
const columns = `id,short_id AS shortId,profile_id AS profileId,name,creator_id AS creatorId,creator_name AS creatorName,created_at AS createdAt,due_at AS dueAt,state,finished_at AS finishedAt,rust_delivery AS rust,discord_delivery AS discord`;
export class TimerStore {
  constructor(private sql: DatabaseSync) {
    const version = Number((sql.prepare('PRAGMA user_version').get() as any).user_version);
    if (version > 2) throw Error('Databasen har en nyare version än ElRusty stöder.');
    sql.exec('PRAGMA busy_timeout=5000;');
    if (version < 2)
      this.transaction(() => {
        sql.exec(`CREATE TABLE IF NOT EXISTS timers (
        id TEXT PRIMARY KEY, short_id TEXT NOT NULL,profile_id TEXT NOT NULL,name TEXT NOT NULL,
        creator_id TEXT NOT NULL,creator_name TEXT NOT NULL,created_at INTEGER NOT NULL,due_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active','expired','cancelled')),finished_at INTEGER,
        rust_delivery TEXT NOT NULL,discord_delivery TEXT NOT NULL,UNIQUE(profile_id,short_id));
        CREATE INDEX IF NOT EXISTS timers_due ON timers(state,due_at);
        CREATE INDEX IF NOT EXISTS timers_profile ON timers(profile_id,state);
        PRAGMA user_version=2;`);
      });
  }
  private transaction<T>(fn: () => T): T {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.sql.exec('COMMIT');
      return value;
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
  }
  create(input: {
    profileId: string;
    name: string;
    creatorId: string;
    creatorName: string;
    createdAt: number;
    dueAt: number;
  }): LiveTimer {
    return this.transaction(() => {
      const count = this.sql
        .prepare("SELECT COUNT(*) AS n FROM timers WHERE profile_id=? AND state='active'")
        .get(input.profileId) as any;
      insist(count.n < 20, 'Högst 20 aktiva timers per serverprofil.');
      let id: string, shortId: string;
      do {
        id = randomUUID();
        shortId = id.slice(0, 8).toUpperCase();
      } while (
        this.sql
          .prepare('SELECT 1 FROM timers WHERE profile_id=? AND short_id=?')
          .get(input.profileId, shortId)
      );
      this.sql
        .prepare("INSERT INTO timers VALUES (?,?,?,?,?,?,?,?, 'active',NULL,'pending','pending')")
        .run(
          id,
          shortId,
          input.profileId,
          input.name,
          input.creatorId,
          input.creatorName,
          input.createdAt,
          input.dueAt,
        );
      return this.get(input.profileId, id)!;
    });
  }
  get(profileId: string, id: string): LiveTimer | undefined {
    return this.sql
      .prepare(`SELECT ${columns} FROM timers WHERE profile_id=? AND (id=? OR short_id=?)`)
      .get(profileId, id, id.toUpperCase()) as unknown as LiveTimer | undefined;
  }
  list(profileId: string | null): LiveTimer[] {
    if (!profileId) return [];
    return this.sql
      .prepare(
        `SELECT ${columns} FROM timers WHERE profile_id=? ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END,CASE WHEN state='active' THEN due_at END ASC,finished_at DESC,id LIMIT 120`,
      )
      .all(profileId) as unknown as LiveTimer[];
  }
  cancel(profileId: string, id: string, creatorId: string, admin: boolean, now: number): LiveTimer {
    return this.transaction(() => {
      const timer = this.get(profileId, id);
      insist(timer, 'Timern finns inte på vald server.');
      insist(admin || timer.creatorId === creatorId, 'Du får bara avbryta dina egna timers.');
      insist(
        timer.state === 'active' && timer.dueAt > now,
        'Timern har redan gått ut eller avbrutits.',
      );
      const changed = this.sql
        .prepare(
          "UPDATE timers SET state='cancelled',finished_at=?,rust_delivery='missed',discord_delivery='missed' WHERE id=? AND state='active' AND due_at>?",
        )
        .run(now, timer.id, now);
      insist(changed.changes === 1, 'Timern har redan gått ut eller avbrutits.');
      const result = this.get(profileId, timer.id)!;
      this.prune(profileId);
      return result;
    });
  }
  recover(now: number) {
    this.transaction(() => {
      this.sql
        .prepare(
          "UPDATE timers SET state='expired',finished_at=?,rust_delivery='missed',discord_delivery='missed' WHERE state='active' AND due_at<=?",
        )
        .run(now, now);
      for (const channel of ['rust', 'discord'] as const) {
        this.sql.exec(
          `UPDATE timers SET ${channel}_delivery=CASE ${channel}_delivery WHEN 'attempting' THEN 'unconfirmed' ELSE 'missed' END WHERE state='expired' AND ${channel}_delivery IN ('pending','attempting');`,
        );
      }
      this.prune();
    });
  }
  claimDue(now: number, profileId: string | null, rust: boolean, discord: boolean): LiveTimer[] {
    return this.transaction(() => {
      const rows = this.sql
        .prepare(
          `UPDATE timers SET state='expired',finished_at=?,rust_delivery=CASE WHEN profile_id=? AND ? THEN 'pending' ELSE 'missed' END,discord_delivery=CASE WHEN profile_id=? AND ? THEN 'pending' ELSE 'missed' END WHERE state='active' AND due_at<=? RETURNING ${columns}`,
        )
        .all(
          now,
          profileId,
          Number(rust),
          profileId,
          Number(discord),
          now,
        ) as unknown as LiveTimer[];
      this.prune();
      return rows;
    });
  }
  attempt(id: string, channel: TimerChannel): boolean {
    return (
      this.sql
        .prepare(
          `UPDATE timers SET ${channel}_delivery='attempting' WHERE id=? AND state='expired' AND ${channel}_delivery='pending'`,
        )
        .run(id).changes === 1
    );
  }
  finish(
    id: string,
    channel: TimerChannel,
    result: TimerDelivery,
    expected: 'pending' | 'attempting',
  ) {
    this.sql
      .prepare(
        `UPDATE timers SET ${channel}_delivery=? WHERE id=? AND state='expired' AND ${channel}_delivery=?`,
      )
      .run(result, id, expected);
  }
  private prune(profileId?: string) {
    const profiles = profileId
      ? [{ profileId }]
      : (this.sql
          .prepare("SELECT DISTINCT profile_id AS profileId FROM timers WHERE state!='active'")
          .all() as { profileId: string }[]);
    for (const p of profiles)
      this.sql
        .prepare(
          "DELETE FROM timers WHERE profile_id=? AND state!='active' AND id NOT IN (SELECT id FROM timers WHERE profile_id=? AND state!='active' ORDER BY finished_at DESC,id LIMIT 100)",
        )
        .run(p.profileId, p.profileId);
  }
  deleteProfile(profileId: string) {
    this.sql.prepare('DELETE FROM timers WHERE profile_id=?').run(profileId);
  }
}
