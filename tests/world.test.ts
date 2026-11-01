import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { LiveDB } from '../server/db';
import { LiveService } from '../server/service';
import { LiveWorld } from '../server/world';
import { gridLocation, imagePosition } from '../shared/world';
import type { RustAdapter } from '../server/rust';
const resources: { s: LiveService; db: LiveDB }[] = [];
afterEach(() => {
  for (const { s, db } of resources.splice(0)) {
    s.close();
    db.close();
  }
  vi.useRealTimers();
});
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function setup() {
  const db = new LiveDB(':memory:');
  const a = Object.assign(new EventEmitter(), {
    open: async () => {},
    close: vi.fn(),
    info: async () => ({
      name: 'Fixture',
      players: 2,
      maxPlayers: 100,
      mapSize: 4500,
      wipeTime: 1,
    }),
    team: async () => [],
    entity: async () => ({ type: 'switch' as const, value: false }),
    set: async () => {},
    timeInfo: async () => ({
      time: 12,
      sunrise: 8,
      sunset: 18,
      dayLengthMinutes: 60,
      timeScale: 1,
    }),
    time: async () => 12,
    chat: async () => {},
    map: vi.fn(async () => ({
      width: 1000,
      height: 1000,
      oceanMargin: 100,
      jpgImage: new Uint8Array([255, 216, 255]),
      monuments: [{ token: 'harbor', x: 100, y: 200 }],
    })),
    markers: vi.fn(async () => [{ id: 1, type: 5, name: 'Cargo', x: 200, y: 300 }]),
  }) satisfies RustAdapter;
  const s = new LiveService(db, () => a),
    world = new LiveWorld(s);
  resources.push({ s, db });
  const id = s.saveProfile({
    name: 'Test',
    host: '127.0.0.1',
    port: 1,
    playerId: '76561198000000000',
    playerToken: 1,
  });
  s.connect(id);
  await flush();
  return { s, a, world, id };
}
it('kartkoordinater hanterar havsmarginal och Y-riktning', () => {
  const m = { width: 1000, height: 800, oceanMargin: 100, mapSize: 4000 };
  expect(imagePosition(0, 0, m)).toEqual({ x: 100, y: 700 });
  expect(imagePosition(4000, 4000, m)).toEqual({ x: 900, y: 100 });
  expect(gridLocation(10, 4300, 4500)).toBe('A0');
  expect(gridLocation(27 * 146.25 + 10, 4300, 4500)).toBe('AB0');
  expect(gridLocation(-1, 0, 4500)).toBe('Utanför rutnätet');
});
it('kartbild cachelagras utanför status och behålls vid avbrott men inte serverbyte', async () => {
  const { s, a, world } = await setup();
  await world.load();
  await world.load();
  expect(a.map).toHaveBeenCalledOnce();
  const revision = world.state.map!.revision;
  expect(world.bytes(revision)).toEqual(new Uint8Array([255, 216, 255]));
  expect(JSON.stringify(s.snapshot())).not.toContain('jpgImage');
  a.emit('lost');
  expect(world.state.map!.revision).toBe(revision);
  expect(world.bytes('foreign')).toBeNull();
  const next = s.saveProfile({
    name: 'Other',
    host: '127.0.0.2',
    port: 1,
    playerId: '76561198000000000',
    playerToken: 1,
  });
  s.connect(next);
  expect(world.state.map).toBeNull();
  expect(world.bytes(revision)).toBeNull();
});
it('första marköravläsningen är baslinje och frånvaro påstås inte vara nedskjutning', async () => {
  vi.useFakeTimers();
  const { s, a } = await setup();
  const events = vi.fn();
  s.on('worldEvent', events);
  expect(events).not.toHaveBeenCalled();
  a.markers.mockResolvedValue([{ id: 2, type: 8, name: 'Heli', x: 200, y: 300 }]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(events).toHaveBeenCalledTimes(2);
  const text = JSON.stringify(events.mock.calls);
  expect(text).toContain('synlig');
  expect(text).toContain('syns inte längre');
  expect(text).not.toContain('nedskjut');
  a.emit('lost');
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toHaveBeenCalledTimes(2);
});
