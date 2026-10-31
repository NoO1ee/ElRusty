import { describe, it, expect } from 'vitest';
import { newNode, byDefinition } from '../src/data/catalog';
import {
  blankCircuit,
  type Circuit,
  type ComponentNode,
  type Stack,
  type WireEdge,
} from '../src/model';
import { initialResult, step } from '../src/simulation/engine';
import { initialInventory, insertStock, layout, roomFor } from '../src/simulation/inventory';
import { powerStatus } from '../src/simulation/power-status';
import { decodeBackup, encodeBackup, loadCircuit, validateCircuit } from '../src/storage';
function wire(
  a: ComponentNode,
  b: ComponentNode,
  source: string,
  target: string,
  kind: 'power' | 'industrial' = 'power',
): WireEdge {
  return {
    id: crypto.randomUUID(),
    type: 'wire',
    source: a.id,
    target: b.id,
    sourceHandle: 'out:' + source,
    targetHandle: 'in:' + target,
    data: { color: '#ff444f', kind, waypoints: [] },
  };
}
function fixture(def: 'furnace' | 'crafter', inventory: Stack[] = []) {
  const machine = newNode(def),
    source = newNode('solar');
  machine.data.settings.inventory = inventory;
  machine.data.settings.blueprints = [];
  const circuit: Circuit = {
    ...blankCircuit(),
    nodes: [source, machine],
    edges: [wire(source, machine, 'Power Out', 'Power In')],
  };
  return { circuit, machine, source };
}
const count = (s: Stack[], id: string, blueprint = false) =>
  s.filter((s) => s.item === id && !!s.blueprint === blueprint).reduce((n, s) => n + s.amount, 0);
describe('ugnsport och strömstatus', () => {
  it('ugnen har enbart Power In bland elportarna och kan inte skicka effekt vidare', () => {
    const { circuit, machine } = fixture('furnace');
    expect(byDefinition.furnace.ports.filter((p) => p.kind === 'power').map((p) => p.name)).toEqual(
      ['Power In'],
    );
    expect(
      Object.keys(step(circuit, initialResult()).outputs).some((k) =>
        k.startsWith(machine.id + '|'),
      ),
    ).toBe(false);
  });
  it('skiljer strömbrist från avstängning och passiva komponenter', () => {
    expect(powerStatus(byDefinition.furnace, 0)).toBe('missing');
    expect(powerStatus(byDefinition.furnace, 2)).toBe('insufficient');
    expect(powerStatus(byDefinition.furnace, 3)).toBeNull();
    expect(powerStatus(byDefinition.box, 0)).toBeNull();
    expect(powerStatus(byDefinition['battery-large'], 0)).toBeNull();
    const { circuit, machine } = fixture('furnace');
    machine.data.settings.enabled = false;
    expect(step(circuit, initialResult()).nodeStates[machine.id].message).toBe('Avstängd');
  });
  it('äldre ugnskablar migreras med förklaring och originalet lämnas orört', () => {
    const { circuit, machine } = fixture('furnace');
    const lamp = newNode('light');
    circuit.nodes.push(lamp);
    circuit.edges.push(wire(machine, lamp, 'Passthrough', 'Power In'));
    const result = loadCircuit(circuit);
    expect(result.notice).toContain('Passthrough');
    expect(result.circuit.edges).toHaveLength(1);
    expect(circuit.edges).toHaveLength(2);
    expect(decodeBackup(encodeBackup('circuit', circuit)).migrationNotice).toContain('Passthrough');
  });
});
describe('separata lagerplatser och blandade ugnsmaterial', () => {
  it('fyller två input-platser utan att låna output-platser', () => {
    const { machine } = fixture('furnace');
    const inv: Stack[] = [];
    expect(insertStock(machine, inv, { item: 'metal.ore', amount: 3000 }, 3000)).toBe(2000);
    expect(inv.map((s) => s.slot)).toEqual([0, 1]);
    expect(roomFor(machine, inv, { item: 'metal.ore', amount: 1 })).toBe(0);
    expect(layout(machine).output).toEqual([2, 3, 4]);
  });
  it('låter två olika malmer dela hastigheten utan att den andra svälter', () => {
    const { circuit, machine } = fixture('furnace', [
      { item: 'metal.ore', amount: 10, slot: 0 },
      { item: 'sulfur.ore', amount: 10, slot: 1 },
    ]);
    let r = step(circuit, initialResult(), 2);
    expect(count(r.nodeStates[machine.id].inventory, 'sulfur')).toBe(1);
    expect(count(r.nodeStates[machine.id].inventory, 'metal.fragments')).toBe(0);
    r = step(circuit, r, 2);
    expect(count(r.nodeStates[machine.id].inventory, 'sulfur')).toBe(2);
    expect(count(r.nodeStates[machine.id].inventory, 'metal.fragments')).toBe(1);
  });
  it('två stackar av samma malm ger samma totalhastighet', () => {
    const { circuit, machine } = fixture('furnace', [
      { item: 'metal.ore', amount: 2, slot: 0 },
      { item: 'metal.ore', amount: 2, slot: 1 },
    ]);
    expect(
      count(step(circuit, initialResult(), 4).nodeStates[machine.id].inventory, 'metal.fragments'),
    ).toBe(2);
  });
  it.each([
    ['can.beans.empty', 'metal.fragments', 15, 6],
    ['can.tuna.empty', 'metal.fragments', 10, 6],
    ['honeycomb', 'honey', 1, 0.4],
  ] as const)('omvandlar %s med rätt mängd', (item, output, amount, time) => {
    const { circuit, machine } = fixture('furnace', [{ item, amount: 1 }]);
    expect(
      count(step(circuit, initialResult(), time).nodeStates[machine.id].inventory, output),
    ).toBe(amount);
  });
  it('bevarar äldre överfulla lager men stoppar produktion med begripligt fel', () => {
    const { circuit, machine } = fixture('furnace', [{ item: 'metal.ore', amount: 2500 }]);
    const r = step(circuit, initialResult(), 100);
    expect(count(r.nodeStates[machine.id].inventory, 'metal.ore')).toBe(2500);
    expect(r.nodeStates[machine.id].message).toContain('Startlagret');
  });
});
describe('blueprints och crafter', () => {
  it('använder blueprint-prioritet och bevarar blueprints efter crafting', () => {
    const { circuit, machine } = fixture('crafter', [
      { item: 'sulfur', amount: 20, slot: 0 },
      { item: 'charcoal', amount: 30, slot: 1 },
      { item: 'gunpowder', amount: 5, slot: 2 },
      { item: 'metal.fragments', amount: 10, slot: 3 },
    ]);
    machine.data.settings.blueprints = ['gunpowder', 'ammo.rifle'];
    machine.data.settings.workbench = 2;
    const r = step(circuit, initialResult(), 4),
      inv = r.nodeStates[machine.id].inventory;
    expect(count(inv, 'gunpowder')).toBe(10);
    expect(count(inv, 'ammo.rifle')).toBe(3);
    expect(count(inv, 'gunpowder', true)).toBe(1);
    expect(count(inv, 'ammo.rifle', true)).toBe(1);
    expect(
      inv.filter((s) => !s.blueprint).every((s) => layout(machine).output.includes(s.slot!)),
    ).toBe(true);
  });
  it('kräver blueprint och hittar nästa recept om första saknar ingredienser', () => {
    const { circuit, machine } = fixture('crafter', [
      { item: 'gunpowder', amount: 5, slot: 0 },
      { item: 'metal.fragments', amount: 10, slot: 1 },
    ]);
    let r = step(circuit, initialResult(), 20);
    expect(r.nodeStates[machine.id].message).toContain('blueprint');
    machine.data.settings.blueprints = ['gunpowder', 'ammo.rifle'];
    machine.data.settings.workbench = 2;
    r = step(circuit, initialResult(), 3);
    expect(count(r.nodeStates[machine.id].inventory, 'ammo.rifle')).toBe(3);
  });
  it('lånar inte frigjorda input-platser när alla fyra output-platser är fulla', () => {
    const { circuit, machine } = fixture('crafter', [
      { item: 'sulfur', amount: 20, slot: 0 },
      { item: 'charcoal', amount: 30, slot: 1 },
      ...[5, 6, 7, 8].map((slot) => ({ item: 'gunpowder', amount: 1000, slot })),
    ]);
    machine.data.settings.blueprints = ['gunpowder'];
    const r = step(circuit, initialResult(), 100);
    expect(count(r.nodeStates[machine.id].inventory, 'sulfur')).toBe(20);
    expect(r.nodeStates[machine.id].message).toContain('fullt');
  });
  it('sparar tomma blueprint-platser och dubbletter i rätt ordning', () => {
    const { machine } = fixture('crafter');
    machine.data.settings.blueprints = ['', 'gunpowder', 'gunpowder', 'ammo.rifle'];
    expect(initialInventory(machine).map((s) => [s.slot, s.item])).toEqual([
      [10, 'gunpowder'],
      [11, 'gunpowder'],
      [12, 'ammo.rifle'],
    ]);
  });
  it.each([true, false])('blueprint-porten transporterar bara blueprints (%s)', (blueprint) => {
    const { circuit, machine, source } = fixture('crafter'),
      box = newNode('box'),
      conveyor = newNode('conveyor');
    box.data.settings.inventory = [
      { item: 'gunpowder', amount: 1, ...(blueprint ? { blueprint: true } : {}) },
    ];
    conveyor.data.settings.filter.rules = [
      { item: 'gunpowder', category: null, blueprint, min: 0, max: 0, buffer: 0 },
    ];
    circuit.nodes.push(box, conveyor);
    circuit.edges.push(
      wire(source, conveyor, 'Power Out', 'Power In'),
      wire(box, conveyor, 'Industrial Out', 'Industrial Input', 'industrial'),
      wire(conveyor, machine, 'Industrial Output', 'Blueprints In', 'industrial'),
    );
    const r = step(circuit, initialResult(), 5);
    expect(count(r.nodeStates[machine.id].inventory, 'gunpowder', true)).toBe(blueprint ? 1 : 0);
    expect(count(r.nodeStates[box.id].inventory, 'gunpowder', blueprint)).toBe(blueprint ? 0 : 1);
  });
  it('transport ut ur Blueprint Out tar inte med ingredienser eller färdiga items', () => {
    const { circuit, machine, source } = fixture('crafter', [
      { item: 'gunpowder', amount: 50, slot: 5 },
      { item: 'sulfur', amount: 20, slot: 0 },
    ]);
    machine.data.settings.blueprints = ['gunpowder'];
    const box = newNode('box'),
      conveyor = newNode('conveyor');
    circuit.nodes.push(box, conveyor);
    circuit.edges.push(
      wire(source, conveyor, 'Power Out', 'Power In'),
      wire(machine, conveyor, 'Blueprint Out', 'Industrial Input', 'industrial'),
      wire(conveyor, box, 'Industrial Output', 'Industrial In', 'industrial'),
    );
    const r = step(circuit, initialResult(), 5);
    expect(r.nodeStates[box.id].inventory).toEqual([
      { item: 'gunpowder', amount: 1, blueprint: true },
    ]);
    expect(count(r.nodeStates[machine.id].inventory, 'gunpowder')).toBe(50);
  });
  it('backup bevarar slot, blueprint-typ och ordning samt avvisar ogiltiga platser', () => {
    const { circuit, machine } = fixture('crafter', [{ item: 'sulfur', amount: 10, slot: 0 }]);
    machine.data.settings.blueprints = ['', 'gunpowder'];
    const restored = decodeBackup(encodeBackup('circuit', circuit)).payload as Circuit;
    expect(restored.nodes[1].data.settings).toEqual(machine.data.settings);
    machine.data.settings.inventory = [{ item: 'sulfur', amount: 1, slot: 9 }];
    expect(() => validateCircuit(circuit)).toThrow('lagerdel');
  });
});
