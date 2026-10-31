import { expect, it } from 'vitest';
import { monumentName, monumentLabels } from '../shared/map-presentation';
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
