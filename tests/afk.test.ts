import { expect, it, vi } from 'vitest';
import { TeamObservations } from '../server/team-observations';
import type { Member } from '../shared/live';
function fixture(config: any = { profiles: [{ id: 'p', playerId: 'owner' }] }) {
  let mono = 0;
  const service: any = {
    config,
    db: { save: vi.fn() },
    timing: () => ({ now: 1700000000000 + mono }),
    log: vi.fn(),
  };
  const observations = new TeamObservations(service, () => mono);
  const m: Member = {
    steamId: 'owner',
    name: 'Owner',
    isOnline: true,
    isAlive: true,
    x: 100,
    y: 100,
    spawnTime: 1,
  };
  observations.start('p', 'wipe1');
  const tick = (ms = 5000, team = [m]) => {
    mono += ms;
    observations.observe(team, null);
  };
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 5000) tick(Math.min(5000, ms - t));
  };
  const total = () => observations.snapshot('owner')?.afkMs || 0;
  tick(0);
  return { observations, m, service, tick, run, total };
}
it('krediterar hela perioden exakt vid tio minuter och fortsätter utan dubbelräkning', () => {
  const f = fixture();
  f.run(595000);
  expect(f.total()).toBe(0);
  expect(f.observations.isAfk('owner')).toBe(false);
  f.tick();
  expect(f.total()).toBe(600000);
  expect(f.observations.isAfk('owner')).toBe(true);
  f.run(600000);
  expect(f.total()).toBe(1200000);
  expect(f.total()).toBeLessThanOrEqual(f.observations.snapshot('owner')!.onlineMs);
  expect(JSON.stringify(f.service.config)).not.toContain('stationary');
});
it('mäter radien från periodens start, inte från föregående prov', () => {
  const f = fixture();
  f.run(590000);
  f.m.x = 102;
  f.tick();
  f.tick();
  expect(f.total()).toBe(600000);
  f.m.x = 102.01;
  f.tick();
  expect(f.observations.isAfk('owner')).toBe(false);
  f.run(595000);
  expect(f.total()).toBe(600000);
  f.tick();
  expect(f.total()).toBe(1200000);
  const slow = fixture();
  for (let i = 1; i <= 180; i++) {
    slow.m.x = 100 + i * 0.1;
    slow.tick();
  }
  expect(slow.total()).toBe(0);
});
it.each(['offline', 'dead', 'spawn', 'death', 'position', 'missing', 'gap', 'interrupt'] as const)(
  'avbryter period vid %s och räknar inte luckan',
  (reason) => {
    const f = fixture();
    f.run(595000);
    if (reason === 'offline') f.m.isOnline = false;
    if (reason === 'dead') f.m.isAlive = false;
    if (reason === 'spawn') f.m.spawnTime = 2;
    if (reason === 'death') f.m.deathTime = 10;
    if (reason === 'position') f.m.x = undefined;
    if (reason === 'interrupt') f.observations.interrupt();
    f.tick(reason === 'gap' ? 15001 : 5000, reason === 'missing' ? [] : [f.m]);
    expect(f.total()).toBe(0);
    expect(f.observations.isAfk('owner')).toBe(false);
    f.m.isOnline = true;
    f.m.isAlive = true;
    f.m.x = 100;
    f.tick();
    f.run(590000);
    expect(f.total()).toBe(0);
  },
);
it('behåller totaler över omstart men aldrig pågående perioder eller nedtid', () => {
  const f = fixture();
  f.run(1200000);
  f.observations.stop();
  const config = structuredClone(f.service.config);
  expect(config.teamObservations.p.members.owner.afkMs).toBe(1200000);
  const next = fixture(config);
  next.run(595000);
  expect(next.total()).toBe(1200000);
  next.tick();
  expect(next.total()).toBe(1800000);
  next.observations.start('other', 'wipe1');
  next.tick();
  expect(next.total()).toBe(0);
  next.observations.start('p', 'wipe2');
  next.tick();
  expect(next.total()).toBe(0);
});
it('läser äldre statistik med noll AFK och sparar bara vid minut eller statusbyte', () => {
  const f = fixture({
    profiles: [{ id: 'p', playerId: 'owner' }],
    teamObservations: {
      p: {
        wipeKey: 'wipe1',
        members: { owner: { name: 'Owner', onlineMs: 100000, lastSeenOnlineAt: 1 } },
      },
    },
  });
  expect(f.total()).toBe(0);
  f.run(600000);
  expect(f.service.db.save).toHaveBeenCalledTimes(10);
  expect(f.total()).toBe(600000);
  f.m.x = 110;
  f.tick();
  expect(f.service.db.save).toHaveBeenCalledTimes(11);
  expect(f.observations.isAfk('owner')).toBe(false);
});

it('avbrott och gamla observationer tar bort aktuell AFK-status men behåller totalen', () => {
  const f = fixture();
  f.run(600000);
  expect(f.observations.isAfk('owner')).toBe(true);
  f.tick(15001);
  expect(f.observations.isAfk('owner')).toBe(false);
  expect(f.total()).toBe(600000);
  f.run(600000);
  expect(f.observations.isAfk('owner')).toBe(true);
  f.observations.interrupt();
  expect(f.observations.isAfk('owner')).toBe(false);
  expect(f.total()).toBe(1200000);
});
