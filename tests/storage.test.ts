import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { RustyDatabase } from '../src/storage';
import { starterCircuit } from '../src/data/catalog';
it('IndexedDB kan återöppna sparad krets inklusive färg, lager och viewport', async () => {
  const name = 'test-' + crypto.randomUUID();
  let db = new RustyDatabase(name);
  const c = starterCircuit();
  c.viewport = { x: 150, y: -20, zoom: 0.7 };
  await db.records.put({ id: c.id, name: c.name, kind: 'circuit', payload: c, updatedAt: 123 });
  db.close();
  db = new RustyDatabase(name);
  const saved = await db.records.get(c.id);
  expect(saved?.payload).toEqual(c);
  await db.delete();
});
