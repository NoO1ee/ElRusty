import { expect, it } from 'vitest';
import { monumentName, monumentLabels, mapGridLabels } from '../shared/map-presentation';
const map = { width: 1000, height: 1000, oceanMargin: 50, mapSize: 1000 };
it('visar begripliga namn och bevarar okända monument', () => {
  expect(monumentName('launchsite')).toBe('Launch Site');
  expect(monumentName('water_treatment_plant_display_name')).toBe('Water Treatment Plant');
  expect(monumentName('new_monument_name')).toBe('New');
});
it('prioriterar stora monument utan överlapp, men gör plats vid inzoomning', () => {
  const items = [
    { token: 'supermarket', x: 510, y: 500 },
    { token: 'launchsite', x: 500, y: 500 },
  ];
  expect(monumentLabels(items, map, { x: 0, y: 0, z: 1 }, 2).map((m) => m.name)).toEqual([
    'Launch Site',
  ]);
  expect(monumentLabels(items, map, { x: 400, y: 400, z: 10 }, 2)).toHaveLength(1);
  const spread = [items[1], { token: 'harbor', x: 550, y: 500 }];
  expect(monumentLabels(spread, map, { x: 400, y: 400, z: 5 }, 2)).toHaveLength(2);
});
it('döljer interna etiketter och tunnelingångar i översikten', () => {
  const items = ['DungeonBase', 'Monument', 'train_tunnel'].map((token) => ({
    token,
    x: 500,
    y: 500,
  }));
  expect(monumentLabels(items, map, { x: 0, y: 0, z: 1 }, 1)).toEqual([]);
  expect(monumentLabels(items, map, { x: 400, y: 400, z: 4 }, 1).map((m) => m.name)).toEqual([
    'Train Tunnel',
  ]);
});

it('placerar rutnamn i samma cellcentrum som gemensamma kartrutor', () => {
  const world = { width: 1800, height: 1600, oceanMargin: 100, mapSize: 4500 };
  const cells = mapGridLabels(world, 1);
  expect(cells).toHaveLength(900);
  expect(cells[0]).toEqual({ label: 'A0', x: 73.125, y: 4314.375 });
  expect(cells[27].label).toBe('AB0');
  expect(cells.at(-1)?.label).toBe('AD29');
  expect(new Set(cells.map((c) => c.label)).size).toBe(cells.length);
});
it('glesar ut text vid utzoomning och döljer oläsbara rutnamn', () => {
  const world = { width: 1800, height: 1800, oceanMargin: 100, mapSize: 4500 };
  expect(mapGridLabels(world, 2)).toHaveLength(225);
  expect(mapGridLabels(world, 4)).toEqual([]);
  expect(mapGridLabels(world, 0)).toEqual([]);
  expect(mapGridLabels(world, NaN)).toEqual([]);
});
