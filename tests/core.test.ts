import { describe, it, expect } from 'vitest';
import { newNode, starterCircuit, catalog } from '../src/data/catalog';
import {
  blankCircuit,
  emptyFilter,
  type Circuit,
  type ComponentNode,
  type WireEdge,
} from '../src/model';
import { byItem, items } from '../src/data/items';
import { categoryIds, validCategoryIds } from '../src/data/categories';
import { initialResult, step, TRANSFER_SECONDS } from '../src/simulation/engine';
import { routeWire, segmentBlocked } from '../src/routing';
import { validateConnection, removeSelection } from '../src/graph';
import { exportRustFilter, importRustFilter } from '../src/filters';
import { encodeBackup, decodeBackup, validateCircuit } from '../src/storage';

function wire(
  a: ComponentNode,
  b: ComponentNode,
  source = 'Power Out',
  target = 'Power In',
  kind: 'power' | 'industrial' = 'power',
): WireEdge {
  return {
    id: crypto.randomUUID(),
    type: 'wire',
    source: a.id,
    target: b.id,
    sourceHandle: 'out:' + source,
    targetHandle: 'in:' + target,
    data: { color: '#ff4d59', kind, waypoints: [] },
  };
}
function graph(nodes: ComponentNode[], edges: WireEdge[] = []): Circuit {
  return { ...blankCircuit(), nodes, edges };
}
const total = (r: ReturnType<typeof step>) =>
  Object.values(r.nodeStates).reduce(
    (sum, n) => sum + n.inventory.reduce((s, i) => s + i.amount, 0),
    0,
  );
describe('speldata och anslutningar', () => {
  it('varje komponent har en riktig lokal spelbild och unika portar', () => {
    for (const c of catalog) {
      expect(byItem[c.shortname], c.name).toBeDefined();
      expect(new Set(c.ports.map((p) => p.id)).size).toBe(c.ports.length);
    }
  });
  it('itemkatalogen är unik och använder spelets glesa kategori-ID:n', () => {
    expect(items.length).toBeGreaterThan(1000);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => validCategoryIds.has(i.categoryId))).toBe(true);
    expect(categoryIds.Component).toBe(13);
    expect(categoryIds.Electrical).toBe(16);
    expect(categoryIds.Fun).toBe(17);
  });
  it('avvisar fel porttyp och upptagna portar', () => {
    const a = newNode('solar'),
      b = newNode('box'),
      light = newNode('light'),
      g = graph([a, b, light]);
    expect(validateConnection(g, a.id, b.id, 'out:Power Out', 'in:Industrial In')).toContain(
      'porttyp',
    );
    g.edges = [wire(a, light)];
    expect(validateConnection(g, a.id, light.id, 'out:Power Out', 'in:Power In')).toContain(
      'redan',
    );
  });
  it('root combiner accepterar inte branch som energikälla', () => {
    const a = newNode('branch'),
      b = newNode('root'),
      g = graph([a, b]);
    expect(validateConnection(g, a.id, b.id, 'out:Power Out', 'in:Root Power 1')).toContain(
      'energikälla',
    );
  });
  it('Delete tar även bort kablar till raderat kort', () => {
    const g = starterCircuit();
    g.nodes[0].selected = true;
    const out = removeSelection(g.nodes, g.edges);
    expect(out.nodes).toHaveLength(4);
    expect(out.edges.some((e) => e.source === g.nodes[0].id)).toBe(false);
  });
});
describe('elektrisk simulering', () => {
  it('sol och vind ger 20 respektive 150 rW', () => {
    const a = newNode('solar'),
      b = newNode('wind');
    const r = step(graph([a, b]), initialResult(), 0);
    expect(r.outputs[a.id + '|out:Power Out']).toBe(20);
    expect(r.outputs[b.id + '|out:Power Out']).toBe(150);
  });
  it('batterier levererar maxeffekt oberoende av laddning', () => {
    for (const [id, watts] of [
      ['battery-small', 15],
      ['battery-medium', 50],
      ['battery-large', 100],
    ] as const) {
      const n = newNode(id);
      const r = step(graph([n]), initialResult(), 86400);
      expect(r.outputs[n.id + '|out:Power Output']).toBe(watts);
    }
  });
  it('branch reserverar Branch Out och lämnar resten', () => {
    const a = newNode('battery-large'),
      b = newNode('branch');
    b.data.settings.branch = 12;
    const r = step(graph([a, b], [wire(a, b, 'Power Output')]), initialResult(), 0);
    expect(r.outputs[b.id + '|out:Branch Out']).toBe(12);
    expect(r.outputs[b.id + '|out:Power Out']).toBe(88);
  });
  it('splitter delar endast mellan anslutna utgångar', () => {
    const a = newNode('solar'),
      b = newNode('splitter'),
      l1 = newNode('light'),
      l2 = newNode('light');
    const r = step(
      graph([a, b, l1, l2], [wire(a, b), wire(b, l1, 'Power Out 1'), wire(b, l2, 'Power Out 2')]),
      initialResult(),
      0,
    );
    expect(r.nodeStates[l1.id].input).toBe(10);
    expect(r.nodeStates[l2.id].input).toBe(10);
  });
  it('avstängd switch stoppar ström', () => {
    const a = newNode('solar'),
      b = newNode('switch'),
      c = newNode('light');
    b.data.settings.enabled = false;
    const r = step(graph([a, b, c], [wire(a, b), wire(b, c)]), initialResult(), 0);
    expect(r.nodeStates[c.id].active).toBe(false);
  });
  it('OR väljer högsta signalen och AND kräver två ingångar', () => {
    const a = newNode('solar'),
      b = newNode('wind'),
      gate = newNode('or'),
      light = newNode('light');
    let g = graph(
      [a, b, gate, light],
      [
        wire(a, gate, 'Power Out', 'Input A'),
        wire(b, gate, 'Power Out', 'Input B'),
        wire(gate, light),
      ],
    );
    expect(step(g, initialResult(), 0).nodeStates[light.id].input).toBe(150);
    gate.data.definition = 'and';
    g.edges = g.edges.filter((e) => e.source !== b.id);
    expect(step(g, initialResult(), 0).nodeStates[light.id].input).toBe(0);
  });
  it('återkopplingsslinga fryser inte och får varning', () => {
    const a = newNode('solar'),
      b = newNode('root'),
      c = newNode('root');
    const g = graph(
      [a, b, c],
      [
        wire(a, b, 'Power Out', 'Root Power 1'),
        wire(b, c, 'Combined Power Out', 'Root Power 1'),
        wire(c, b, 'Combined Power Out', 'Root Power 2'),
      ],
    );
    const r = step(g, initialResult(), 0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('timer startas av stigande signal och slutar efter sin tid', () => {
    const a = newNode('battery-large'),
      b = newNode('solar'),
      t = newNode('timer');
    t.data.settings.seconds = 1;
    const g = graph([a, b, t], [wire(a, t, 'Power Output'), wire(b, t, 'Power Out', 'Toggle On')]);
    let r = step(g, initialResult(), 0.25);
    expect(r.outputs[t.id + '|out:Power Out']).toBe(100);
    r = step(g, r, 2);
    expect(r.outputs[t.id + '|out:Power Out']).toBe(0);
  });
  it('geometri och kabelfärger ändrar inga beräkningar', () => {
    const a = starterCircuit(),
      b = structuredClone(a);
    b.nodes[0].position = { x: 250, y: -400 };
    b.edges[0].data!.color = '#65b4ff';
    expect(step(a, initialResult(), 0)).toEqual(step(b, initialResult(), 0));
  });
});
describe('industrial', () => {
  it('en buffer större än transportbudgeten kan levereras över flera cykler', () => {
    const g = starterCircuit(),
      c = g.nodes.find((n) => n.data.definition === 'conveyor')!,
      source = g.nodes.find((n) => n.data.settings.inventory.length)!;
    source.data.settings.inventory = [{ item: 'wood', amount: 1000 }];
    c.data.settings.filter.rules = [
      { item: 'wood', category: null, min: 0, max: 0, buffer: 1000, blueprint: false },
    ];
    let r = initialResult();
    for (let i = 0; i < 8; i++) r = step(g, r, 5);
    expect(r.transfers).toBe(1000);
    expect(total(r)).toBe(1000);
  });
  it('flyttar items utan att skapa eller förlora mängd', () => {
    const g = starterCircuit();
    const r = step(g, initialResult(), TRANSFER_SECONDS);
    expect(total(r)).toBe(6000);
    expect(r.transfers).toBeGreaterThan(0);
    expect(Object.values(r.nodeStates).some((n) => n.inventory.some((s) => s.amount < 0))).toBe(
      false,
    );
  });
  it('behåller min i källan och respekterar max i målet', () => {
    const g = starterCircuit(),
      c = g.nodes.find((n) => n.data.definition === 'conveyor')!,
      s = g.nodes.find((n) => n.data.settings.inventory.length)!;
    s.data.settings.inventory = [{ item: 'wood', amount: 200 }];
    c.data.settings.filter.rules = [
      { item: 'wood', category: null, min: 190, max: 5, buffer: 0, blueprint: false },
    ];
    const r = step(g, initialResult(), 5);
    expect(r.nodeStates[s.id].inventory[0].amount).toBe(195);
    expect(r.transfers).toBe(5);
  });
  it('buffer hindrar för liten sats', () => {
    const g = starterCircuit(),
      c = g.nodes.find((n) => n.data.definition === 'conveyor')!;
    c.data.settings.filter.rules = [
      { item: 'wood', category: null, min: 4990, max: 0, buffer: 20, blueprint: false },
    ];
    expect(step(g, initialResult(), 5).transfers).toBe(0);
  });
  it('full destination förlorar inga items', () => {
    const g = starterCircuit(),
      dest = g.nodes.at(-1)!;
    dest.data.settings.slots = 1;
    dest.data.settings.inventory = [{ item: 'wood', amount: 1000 }];
    const r = step(g, initialResult(), 5);
    expect(r.transfers).toBe(0);
    expect(total(r)).toBe(7000);
  });
  it('Require All stoppar om en regel saknar tillgängliga items', () => {
    const g = starterCircuit(),
      c = g.nodes.find((n) => n.data.definition === 'conveyor')!;
    c.data.settings.filter.mode = 'all';
    c.data.settings.filter.rules = [
      { item: 'wood', category: null, min: 0, max: 0, buffer: 0, blueprint: false },
      { item: 'sulfur', category: null, min: 0, max: 0, buffer: 0, blueprint: false },
    ];
    expect(step(g, initialResult(), 5).transfers).toBe(0);
  });
  it('Exclude blockerar endast matchande items', () => {
    const g = starterCircuit(),
      c = g.nodes.find((n) => n.data.definition === 'conveyor')!;
    c.data.settings.filter.mode = 'exclude';
    c.data.settings.filter.rules = [
      { item: 'wood', category: null, min: 0, max: 0, buffer: 0, blueprint: false },
    ];
    const r = step(g, initialResult(), 5);
    expect(r.transfers).toBeGreaterThan(0);
    expect(r.nodeStates[g.nodes.at(-1)!.id].inventory.every((s) => s.item !== 'wood')).toBe(true);
  });
  it('conveyor utan ström flyttar ingenting', () => {
    const g = starterCircuit();
    g.edges = g.edges.filter((e) => e.data?.kind === 'industrial');
    expect(step(g, initialResult(), 5).transfers).toBe(0);
  });
});
describe('kabelrouting', () => {
  it('går runt hinder med raka 90-graderssegment', () => {
    const obstacles = [{ x: 120, y: -30, width: 100, height: 100 }];
    const r = routeWire({ x: 0, y: 0 }, { x: 400, y: 0 }, obstacles);
    expect(r.conflict).toBe(false);
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(segmentBlocked(a, b, obstacles)).toBe(false);
    }
    expect(r.points[0]).toEqual({ x: 0, y: 0 });
    expect(r.points.at(-1)).toEqual({ x: 400, y: 0 });
  });
  it('behåller egna brytpunkter och flaggar konflikt', () => {
    const r = routeWire(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      [{ x: 120, y: -20, width: 100, height: 100 }],
      [{ x: 150, y: 0 }],
    );
    expect(r.conflict).toBe(true);
  });
});
describe('filter och backup', () => {
  it('matchar användarens verkliga referensexport med kategorierna 1, 2 och 16', () => {
    const sample = [1, 2, 16].map((TargetCategory) => ({
      TargetCategory,
      MaxAmountInOutput: 0,
      BufferAmount: 0,
      MinAmountInInput: 0,
      IsBlueprint: false,
      TargetItemName: '',
    }));
    const rules = importRustFilter(JSON.stringify(sample));
    expect(JSON.parse(exportRustFilter({ name: 'User fixture', mode: 'any', rules }))).toEqual(
      sample,
    );
  });
  it('exporterar och importerar exakt sex Rust-fält per regel', () => {
    const f = emptyFilter();
    f.rules = [
      { item: 'wood', category: null, min: 5, max: 1000, buffer: 10, blueprint: false },
      { item: null, category: 1, min: 0, max: 0, buffer: 0, blueprint: false },
    ];
    const json = exportRustFilter(f);
    expect(Object.keys(JSON.parse(json)[0])).toEqual([
      'TargetCategory',
      'MaxAmountInOutput',
      'BufferAmount',
      'MinAmountInInput',
      'IsBlueprint',
      'TargetItemName',
    ]);
    expect(importRustFilter(json)).toEqual(f.rules);
  });
  it('avvisar felaktiga mängder och för många regler', () => {
    const f = emptyFilter();
    f.rules = [{ item: 'wood', category: null, min: -1, max: 0, buffer: 0, blueprint: false }];
    expect(() => exportRustFilter(f)).toThrow();
    f.rules = Array.from({ length: 31 }, () => ({
      item: 'wood',
      category: null,
      min: 0,
      max: 0,
      buffer: 0,
      blueprint: false,
    }));
    expect(() => exportRustFilter(f)).toThrow();
  });
  it('backup behåller kabelfärg och brytpunkter men får nytt id', () => {
    const c = starterCircuit();
    c.edges[0].data!.waypoints = [{ x: 12, y: 34 }];
    const r = decodeBackup(encodeBackup('circuit', c));
    expect(r.id).not.toBe(c.id);
    expect((r.payload as Circuit).edges[0].data).toEqual(c.edges[0].data);
  });
  it('avvisar fel formatversion och okända komponenter', () => {
    expect(() => decodeBackup('{"application":"ElRusty","schemaVersion":99}')).toThrow();
    const c = starterCircuit();
    c.nodes[0].data.definition = 'unknown';
    expect(() => validateCircuit(c)).toThrow();
  });
});
