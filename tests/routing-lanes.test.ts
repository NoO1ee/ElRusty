import { describe, it, expect } from 'vitest';
import { openExample } from '../src/data/examples';
import { byDefinition, nodeHeight, NODE_WIDTH, portY } from '../src/data/catalog';
import { routeConnections, segmentBlocked, WIRE_GAP, type WireConnection } from '../src/routing';
import type { Circuit } from '../src/model';
import type { XYPosition } from '@xyflow/react';
function geometry(c: Circuit) {
  const locate = (id: string, handle: string) => {
    const n = c.nodes.find((n) => n.id === id)!,
      d = byDefinition[n.data.definition],
      p = d.ports.find((p) => p.id === handle)!;
    return {
      x: n.position.x + (p.direction === 'out' ? NODE_WIDTH : 0),
      y: n.position.y + portY(p, d.ports.indexOf(p), d.ports),
    };
  };
  const wires: WireConnection[] = c.edges.map((e) => ({
    id: e.id,
    start: locate(e.source, e.sourceHandle!),
    end: locate(e.target, e.targetHandle!),
    waypoints: e.data!.waypoints,
  }));
  const obstacles = c.nodes.map((n) => ({
    ...n.position,
    width: NODE_WIDTH,
    height: nodeHeight(byDefinition[n.data.definition]),
  }));
  return { wires, obstacles };
}
const segments = (p: XYPosition[]) => p.slice(1).map((b, i) => ({ a: p[i], b }));
function sharedLength(a: XYPosition[], b: XYPosition[]) {
  let total = 0;
  for (const s of segments(a))
    for (const t of segments(b)) {
      const vertical =
        Math.abs(s.a.x - s.b.x) < 0.01 &&
        Math.abs(t.a.x - t.b.x) < 0.01 &&
        Math.abs(s.a.x - t.a.x) < 0.01;
      const horizontal =
        Math.abs(s.a.y - s.b.y) < 0.01 &&
        Math.abs(t.a.y - t.b.y) < 0.01 &&
        Math.abs(s.a.y - t.a.y) < 0.01;
      if (vertical)
        total += Math.max(
          0,
          Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) -
            Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y)),
        );
      if (horizontal)
        total += Math.max(
          0,
          Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) -
            Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x)),
        );
    }
  return total;
}
describe('separata kabelspår', () => {
  it('Nih: Power In, Set och Reset delar inte en gemensam sträcka', () => {
    const c = openExample('nih-core'),
      { wires, obstacles } = geometry(c),
      routes = routeConnections(wires, obstacles);
    const memory = c.nodes.find((n) => n.data.definition === 'memory')!;
    const inputs = c.edges
      .filter((e) => e.target === memory.id)
      .map((e) => routes.get(e.id)!.points);
    expect(inputs).toHaveLength(3);
    for (let i = 0; i < inputs.length; i++)
      for (let j = i + 1; j < inputs.length; j++)
        expect(sharedLength(inputs[i], inputs[j])).toBe(0);
  });
  it.each(['nih-core', 'bcn-core', 'nexus'])(
    '%s behåller exakta portar, räta vinklar och vägar utanför korten',
    (id) => {
      const c = openExample(id),
        { wires, obstacles } = geometry(c),
        routes = routeConnections(wires, obstacles);
      for (const wire of wires) {
        const r = routes.get(wire.id)!;
        expect(r.conflict).toBe(false);
        expect(r.points[0]).toEqual(wire.start);
        expect(r.points.at(-1)).toEqual(wire.end);
        for (const s of segments(r.points)) {
          expect(s.a.x === s.b.x || s.a.y === s.b.y).toBe(true);
          expect(segmentBlocked(s.a, s.b, obstacles)).toBe(false);
        }
      }
    },
  );
  it('väljer skilda vertikala spår till närliggande ingångar', () => {
    const wires = [
      { id: 'set', start: { x: 0, y: 300 }, end: { x: 400, y: 30 }, waypoints: [] },
      { id: 'reset', start: { x: 0, y: 500 }, end: { x: 400, y: 60 }, waypoints: [] },
    ];
    const r = routeConnections(wires, []),
      a = r.get('set')!.points,
      b = r.get('reset')!.points;
    expect(sharedLength(a, b)).toBe(0);
    const longA = segments(a).find((s) => s.a.x === s.b.x && Math.abs(s.a.y - s.b.y) > 100)!;
    const longB = segments(b).find((s) => s.a.x === s.b.x && Math.abs(s.a.y - s.b.y) > 100)!;
    expect(Math.abs(longA.a.x - longB.a.x)).toBeGreaterThanOrEqual(WIRE_GAP);
  });
  it('egna brytpunkter reserveras först och ändras inte', () => {
    const wires: WireConnection[] = [
      { id: 'auto', start: { x: 0, y: 400 }, end: { x: 500, y: 30 }, waypoints: [] },
      {
        id: 'manual',
        start: { x: 0, y: 300 },
        end: { x: 500, y: 60 },
        waypoints: [{ x: 300, y: 400 }],
      },
    ];
    const copy = structuredClone(wires),
      r = routeConnections(wires, []);
    expect(wires).toEqual(copy);
    expect(r.get('manual')!.points).toContainEqual({ x: 300, y: 400 });
    expect(r.get('manual')!.conflict).toBe(false);
  });
  it('flyttade kort räknas om och färgändringar påverkar inte vägarna', () => {
    const c = openExample('nih-core'),
      g = geometry(c),
      before = routeConnections(g.wires, g.obstacles);
    c.edges[0].data!.color = '#77d7b0';
    const color = geometry(c);
    expect(routeConnections(color.wires, color.obstacles)).toEqual(before);
    c.nodes.find((n) => n.data.definition === 'memory')!.position.x += 100;
    const moved = geometry(c),
      after = routeConnections(moved.wires, moved.obstacles);
    expect(after).not.toEqual(before);
    for (const wire of moved.wires) expect(after.get(wire.id)!.points.at(-1)).toEqual(wire.end);
  });
});
