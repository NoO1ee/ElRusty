import { expect, it, afterEach, vi } from 'vitest';
import { nextLastDeath, type TeamMapNote } from '../shared/team-map';
import { normalizeTeamInfo } from '../server/team-info';
import type { Member } from '../shared/live';
import { LiveService } from '../server/service';
import { LiveDB } from '../server/db';
import { EventEmitter } from 'node:events';
const owner = '76561198000000000';
const alive: Member = {
  steamId: owner,
  name: 'Owner',
  isOnline: true,
  isAlive: true,
  x: 100,
  y: 200,
  deathTime: 10,
};
const note = (source: 'self' | 'leader' = 'self', type = 0): TeamMapNote => ({
  id: source + ':0',
  source,
  type,
  x: 120,
  y: 220,
  label: 'Min bas',
  icon: 0,
  colourIndex: 0,
});
it('normaliserar egna och ledarens nålar, etiketter och ikoner utan att dubblettera ledarens egna', () => {
  const raw = {
    leaderSteamId: 'other',
    members: [],
    mapNotes: [{ x: 1, y: 2, label: 'Min bas', icon: 6, colourIndex: 2 }],
    leaderMapNotes: [{ x: 3, y: 4, type: 1, label: 'Teamets bas' }],
  };
  const a = normalizeTeamInfo(raw, owner);
  expect(a.notes).toHaveLength(2);
  expect(a.notes[0]).toMatchObject({
    source: 'self',
    type: 0,
    icon: 6,
    colourIndex: 2,
    label: 'Min bas',
  });
  expect(normalizeTeamInfo({ ...raw, leaderSteamId: owner }, owner).notes).toHaveLength(1);
  expect(
    normalizeTeamInfo({ ...raw, mapNotes: [{ x: NaN, y: 1 }], leaderMapNotes: [] }, owner).notes,
  ).toEqual([]);
});
it('utelämnade medlemskoordinater blir okända och booleska standardvärden blir falska', () => {
  const m = normalizeTeamInfo({ members: [{ steamId: owner, name: 'Owner' }] }, owner).members[0];
  expect(m).toMatchObject({ isAlive: false, isOnline: false });
  expect(m.x).toBeUndefined();
  expect(m.y).toBeUndefined();
  expect(m.deathTime).toBeUndefined();
});
it('använder egen serverrapporterad dödsnotering; en egen dödskalle eller ledarens notering är inte din dödsplats', () => {
  expect(nextLastDeath(null, undefined, alive, [{ ...note(), icon: 6 }], 1000)).toBeNull();
  expect(nextLastDeath(null, undefined, alive, [note('leader', 2)], 1000)).toBeNull();
  const death = nextLastDeath(null, undefined, alive, [note('self', 2)], 1000)!;
  expect(death).toEqual({ x: 120, y: 220, at: 10000, observedAt: 1000, approximate: false });
  expect(nextLastDeath(death, alive, alive, [note('self', 2)], 2000)).toBe(death);
});
it('behåller senaste dödsplats efter respawn och markerar uppskattade positioner tydligt', () => {
  const dead = { ...alive, isAlive: false, x: undefined, y: undefined, deathTime: 20 };
  const death = nextLastDeath(null, alive, dead, [], 21000)!;
  expect(death).toMatchObject({ x: 100, y: 200, approximate: true, at: 20000 });
  expect(nextLastDeath(death, dead, { ...alive, x: 800, y: 800, deathTime: 20 }, [], 22000)).toBe(
    death,
  );
  const exact = nextLastDeath(death, dead, dead, [note('self', 2)], 23000)!;
  expect(exact).toMatchObject({ x: 120, y: 220, approximate: false });
});
it('gissar inte historisk dödsplats från aktuell spawnposition när tjänsten startar', () => {
  expect(nextLastDeath(null, undefined, alive, [], 20000)).toBeNull();
  expect(
    nextLastDeath(null, alive, { ...alive, deathTime: 20, x: 900, y: 900 }, [], 20000),
  ).toMatchObject({ x: 100, y: 200, approximate: true });
  expect(
    nextLastDeath(
      null,
      undefined,
      { ...alive, isAlive: false, x: undefined, y: undefined },
      [],
      20000,
    ),
  ).toBeNull();
});
const clean: (() => void)[] = [];
afterEach(() => clean.splice(0).forEach((f) => f()));
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
it('sparar senaste egna dödsplats per profil/wipe och återställer den vid omstart', async () => {
  const db = new LiveDB(':memory:');
  let member = alive,
    notes: TeamMapNote[] = [];
  let wipe = 1;
  class Fake extends EventEmitter {
    open = async () => {};
    close = () => {};
    info = async () => ({
      name: 'Test',
      mapSize: 1000,
      seed: 1,
      wipeTime: wipe,
      players: 1,
      maxPlayers: 10,
    });
    team = async () => [structuredClone(member)];
    teamNotes = () => notes;
    entity = async () => ({ type: 'switch' as const, value: false });
    set = async () => {};
    time = async () => 12;
    chat = async () => {};
  }
  const s = new LiveService(db, () => new Fake());
  clean.push(() => {
    s.close();
    db.close();
  });
  const id = s.saveProfile({
    name: 'Test',
    host: 'localhost',
    port: 1,
    playerId: owner,
    playerToken: 1,
  });
  s.connect(id);
  await flush();
  member = { ...alive, isAlive: false, deathTime: 20 };
  notes = [note('self', 2)];
  await s.refreshTeam();
  expect(s.snapshot().lastDeath).toMatchObject({ x: 120, y: 220, approximate: false });
  expect(Object.keys(db.load().deathLocations!)).toHaveLength(1);
  member = { ...alive, deathTime: 20 };
  notes = [];
  s.connect(id);
  await flush();
  expect(s.snapshot().lastDeath?.x).toBe(120);
  wipe = 2;
  s.connect(id);
  await flush();
  expect(s.snapshot().lastDeath).toBeNull();
  const second = s.saveProfile({
    name: 'Other',
    host: 'localhost',
    port: 2,
    playerId: owner,
    playerToken: 1,
  });
  s.connect(second);
  await flush();
  expect(s.snapshot().mapNotes).toEqual([]);
  expect(s.snapshot().lastDeath).toBeNull();
});
