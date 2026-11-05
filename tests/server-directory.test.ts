import { expect, it } from 'vitest';
import {
  ServerDirectory,
  normalizeDirectory,
  parseDirectoryQuery,
} from '../server/server-directory';
import { selectedWipe } from '../shared/servers';
const now = Date.parse('2026-11-04T12:00:00Z');
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  n: 'Server ' + id,
  ip: '203.0.113.1',
  pt: 28015,
  p: 50,
  mp: 100,
  q: 0,
  rg: 'EU',
  c: 'SE',
  src: 'user',
  born: '2026-10-29T10:00:00Z',
  wipes: [{ t: '2026-11-04T23:30:00Z', k: 'map' }],
  path: '/server/' + id,
  ...extra,
});
const payload = (rows: unknown[]) => ({ fetchedAt: new Date(now).toISOString(), data: rows });
it('bara explicita scheman räknas som deklarerade; query/detected blir inte säkra wipedagar', () => {
  const { servers } = normalizeDirectory(
    payload([
      row('owner'),
      row('detected', { src: 'detected' }),
      row('query', { src: 'query' }),
      row('unknown', { src: null }),
    ]),
    now,
  );
  expect(servers.map((s) => s.scheduleSource)).toEqual([
    'declared',
    'estimated',
    'estimated',
    'unknown',
  ]);
  expect(servers[0].wipes).toHaveLength(1);
  for (const s of servers.slice(1)) expect(s.wipes).toEqual([]);
  expect(selectedWipe(servers[0], 'thu', now)?.at).toBe(Date.parse('2026-11-04T23:30:00Z'));
  expect(selectedWipe(servers[0], 'wed', now)).toBeNull();
});
it('väljer rätt kommande wipe för vald svensk veckodag och hoppar över passerade datum', () => {
  const { servers } = normalizeDirectory(
    payload([
      row('multi', {
        wipes: [
          { t: '2026-11-03T15:00:00Z', k: 'map' },
          { t: '2026-11-09T15:00:00Z', k: 'map' },
          { t: '2026-11-12T15:00:00Z', k: 'full' },
        ],
      }),
    ]),
    now,
  );
  expect(selectedWipe(servers[0], 'all', now)?.kind).toBe('map');
  expect(selectedWipe(servers[0], 'thu', now)?.kind).toBe('full');
  expect(selectedWipe(servers[0], 'fri', now)).toBeNull();
});
it('avvisar farliga adresser, länkar och orimliga fält utan att hitta på population', () => {
  const p = payload([
    row('ok', { path: 'https://evil.example/' }),
    row('badip', { ip: 'javascript:bad' }),
    row('badport', { pt: 0 }),
    row('badplayers', { p: null }),
    row('ok'),
  ]);
  const { servers } = normalizeDirectory(p, now);
  expect(servers).toHaveLength(1);
  expect(servers[0].sourceUrl).toBe('https://wipeboard.net');
  expect(() => normalizeDirectory({ data: [] }, now)).toThrow('tidsstämpel');
  expect(() => parseDirectoryQuery(new URLSearchParams('region=__proto__'))).toThrow('region');
  expect(() => parseDirectoryQuery(new URLSearchParams('page=-1'))).toThrow('population');
});
it('filter, sortering och sidindelning görs över hela datamängden', async () => {
  const rows = Array.from({ length: 125 }, (_, i) =>
    row(String(i), { p: i, rg: i === 124 ? 'NA' : 'EU' }),
  );
  const directory = new ServerDirectory(
    async () => new Response(JSON.stringify(payload(rows))),
    () => now,
  );
  const result = await directory.list(
    new URLSearchParams('minPlayers=20&sort=players-desc&page=2'),
  );
  expect(result.total).toBe(104);
  expect(result.pages).toBe(3);
  expect(result.servers).toHaveLength(50);
  expect(result.servers[0].players).toBe(73);
  const search = await directory.list(new URLSearchParams('q=SERVER%20123'));
  expect(search.total).toBe(1);
  const all = await directory.list(new URLSearchParams('region=all'));
  expect(all.total).toBe(125);
  const clamped = await directory.list(new URLSearchParams('page=999'));
  expect(clamped.page).toBe(3);
});
it('wipefilter utesluter osäkra scheman men populationslistan behåller servrar utan schema', async () => {
  const directory = new ServerDirectory(
    async () =>
      new Response(
        JSON.stringify(payload([row('a'), row('b', { src: 'query' }), row('c', { src: null })])),
      ),
    () => now,
  );
  expect((await directory.list(new URLSearchParams())).total).toBe(3);
  const filtered = await directory.list(new URLSearchParams('day=thu'));
  expect(filtered.servers.map((s) => s.id)).toEqual(['a']);
});
it('delar samtidig hämtning, använder cache och visar gammal lista vid källfel utan transportdetaljer', async () => {
  let at = now,
    calls = 0,
    release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const directory = new ServerDirectory(
    async () => {
      calls++;
      await gate;
      if (calls > 1) throw Error('private transport detail');
      return new Response(JSON.stringify(payload([row('a')])));
    },
    () => at,
  );
  const a = directory.list(new URLSearchParams()),
    b = directory.list(new URLSearchParams('q=a'));
  release();
  await Promise.all([a, b]);
  expect(calls).toBe(1);
  await directory.list(new URLSearchParams());
  expect(calls).toBe(1);
  at += 300001;
  const stale = await directory.list(new URLSearchParams());
  expect(stale.stale).toBe(true);
  expect(stale.total).toBe(1);
  expect(stale.warning).not.toContain('private');
  await directory.list(new URLSearchParams());
  expect(calls).toBe(2);
});
it('misslyckad första hämtning ger säkert fel och bromsar nya försök', async () => {
  let calls = 0;
  const directory = new ServerDirectory(
    async () => {
      calls++;
      return new Response('secret upstream text', { status: 429 });
    },
    () => now,
  );
  await expect(directory.list(new URLSearchParams())).rejects.toThrow(
    'Serverlistan kunde inte hämtas',
  );
  await expect(directory.list(new URLSearchParams())).rejects.not.toThrow('secret');
  expect(calls).toBe(1);
});
it('stoppar överstora källsvar', async () => {
  const directory = new ServerDirectory(
    async () => new Response(new Uint8Array(24 * 1024 * 1024 + 1)),
    () => now,
  );
  await expect(directory.list(new URLSearchParams())).rejects.toThrow('kunde inte hämtas');
});

it('gruppfilter använder exakt rapporterad gräns före sidindelning och skiljer okänt från stora grupper', async () => {
  const rows = Array.from({ length: 65 }, (_, i) => row('duo' + i, { team: 2 }));
  rows.push(
    row('solo', { team: 1 }),
    row('trio', { team: 3 }),
    row('eight', { team: 8 }),
    row('large', { team: 12 }),
  );
  for (const [i, team] of [0, null, undefined, -1, 2.5, '2', 1001].entries())
    rows.push(row('unknown' + i, { team }));
  const directory = new ServerDirectory(
    async () => new Response(JSON.stringify(payload(rows))),
    () => now,
  );
  expect(parseDirectoryQuery(new URLSearchParams()).group).toBe('all');
  for (const group of ['__proto__', '-1', '2.5', 'solo', '9'])
    expect(() => parseDirectoryQuery(new URLSearchParams({ group }))).toThrow('gruppgräns');
  const duo = await directory.list(new URLSearchParams('group=2&page=2&day=thu&minPlayers=40'));
  expect(duo.total).toBe(65);
  expect(duo.servers).toHaveLength(15);
  expect(duo.servers.every((s) => s.groupLimit === 2)).toBe(true);
  expect((await directory.list(new URLSearchParams('group=1'))).servers.map((s) => s.id)).toEqual([
    'solo',
  ]);
  expect((await directory.list(new URLSearchParams('group=3'))).servers.map((s) => s.id)).toEqual([
    'trio',
  ]);
  expect((await directory.list(new URLSearchParams('group=8'))).servers.map((s) => s.id)).toEqual([
    'eight',
  ]);
  expect(
    (await directory.list(new URLSearchParams('group=9plus'))).servers.map((s) => s.id),
  ).toEqual(['large']);
  expect((await directory.list(new URLSearchParams('group=unknown'))).total).toBe(7);
  expect((await directory.list(new URLSearchParams())).total).toBe(rows.length);
});
