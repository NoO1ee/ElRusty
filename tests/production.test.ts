import { describe, it, expect } from 'vitest';
import { newNode } from '../src/data/catalog';
import { blankCircuit, type Stack, type SimulationResult, type Circuit } from '../src/model';
import { initialResult, step } from '../src/simulation/engine';
import { craftSeconds } from '../src/simulation/production';
import { validateCircuit } from '../src/storage';

function setup(definition: 'furnace' | 'crafter', inventory: Stack[], slots = 48) {
  const power = newNode('solar'),
    machine = newNode(definition);
  Object.assign(machine.data.settings, { inventory, slots, workbench: 1 });
  const circuit: Circuit = {
    ...blankCircuit(),
    nodes: [power, machine],
    edges: [
      {
        id: 'power',
        type: 'wire' as const,
        source: power.id,
        target: machine.id,
        sourceHandle: 'out:Power Out',
        targetHandle: 'in:Power In',
        data: { color: '#ff444f', kind: 'power' as const, waypoints: [] },
      },
    ],
  };
  const stock = (r: SimulationResult) => {
    const result: Stack[] = [];
    for (const s of r.nodeStates[machine.id].inventory.filter((s) => !s.blueprint)) {
      const old = result.find((i) => i.item === s.item);
      if (old) old.amount += s.amount;
      else result.push({ item: s.item, amount: s.amount });
    }
    return result;
  };
  return { circuit, machine, power, stock };
}
describe('produktionsregler', () => {
  it.each([
    ['metal.ore', 'metal.fragments', 2],
    ['sulfur.ore', 'sulfur', 1],
    ['hq.metal.ore', 'metal.refined', 4],
  ] as const)('smälter %s med rätt tid och mängd', (ore, output, seconds) => {
    const { circuit, stock } = setup('furnace', [{ item: ore, amount: 10 }]);
    const before = step(circuit, initialResult(), seconds - 0.25);
    expect(stock(before)).toEqual([{ item: ore, amount: 10 }]);
    expect(stock(step(circuit, before, 0.25))).toEqual([
      { item: ore, amount: 9 },
      { item: output, amount: 1 },
    ]);
  });
  it('ger samma produktion för stora och små tidssteg, även vid byte av malm', () => {
    const { circuit, stock } = setup('furnace', [
      { item: 'metal.ore', amount: 2 },
      { item: 'sulfur.ore', amount: 5 },
    ]);
    let small = initialResult();
    for (let i = 0; i < 33; i++) small = step(circuit, small, 0.25);
    const large = step(circuit, initialResult(), 8.25);
    expect(stock(large)).toEqual(stock(small));
    expect(large.memory).toEqual(small.memory);
  });
  it('tomgång lagrar inte tid som kan användas på senare material', () => {
    const { circuit, machine, stock } = setup('furnace', []);
    const idle = step(circuit, initialResult(), 1000);
    idle.nodeStates[machine.id].inventory = [{ item: 'metal.ore', amount: 20, slot: 0 }];
    expect(stock(step(circuit, idle, 0.25))).toEqual([{ item: 'metal.ore', amount: 20 }]);
    expect(idle.memory[machine.id].progress).toBe(0);
  });
  it('bevarar bara påbörjat arbete vid strömavbrott', () => {
    const { circuit, power, stock } = setup('furnace', [{ item: 'metal.ore', amount: 2 }]);
    let r = step(circuit, initialResult(), 1);
    power.data.settings.enabled = false;
    r = step(circuit, r, 100);
    expect(stock(r)).toEqual([{ item: 'metal.ore', amount: 2 }]);
    power.data.settings.enabled = true;
    expect(stock(step(circuit, r, 1))).toContainEqual({ item: 'metal.fragments', amount: 1 });
  });
  it.each([
    [1, 2],
    [2, 1],
    [3, 1],
  ])('Gun Powder på tier %s tar %s sekunder per sats', (tier, seconds) => {
    const { circuit, machine, stock } = setup('crafter', [
      { item: 'sulfur', amount: 40 },
      { item: 'charcoal', amount: 60 },
    ]);
    machine.data.settings.workbench = tier;
    const r = step(circuit, initialResult(), seconds * 2);
    expect(stock(r)).toEqual([{ item: 'gunpowder', amount: 20 }]);
    expect(craftSeconds('gunpowder', tier)).toBe(seconds);
  });
  it('använder dokumenterade tider för Rifle Ammo och Medical Syringe', () => {
    expect([craftSeconds('ammo.rifle', 2), craftSeconds('ammo.rifle', 3)]).toEqual([3, 1]);
    expect([craftSeconds('syringe.medical', 2), craftSeconds('syringe.medical', 3)]).toEqual([
      10, 5,
    ]);
  });
  it('för låg workbench förbrukar inget och bygger inte upp tid', () => {
    const { circuit, machine, stock } = setup('crafter', [
      { item: 'metal.fragments', amount: 10 },
      { item: 'gunpowder', amount: 5 },
    ]);
    machine.data.settings.recipe = 'ammo.rifle';
    const r = step(circuit, initialResult(), 1000);
    expect(stock(r)).toEqual(machine.data.settings.inventory);
    expect(r.nodeStates[machine.id].message).toContain('Workbench');
    machine.data.settings.workbench = 2;
    expect(stock(step(circuit, r, 0.25))).toEqual(machine.data.settings.inventory);
  });
  it('ingrediens- och output-platser är separata', () => {
    const { circuit, stock } = setup(
      'crafter',
      [
        { item: 'sulfur', amount: 20 },
        { item: 'charcoal', amount: 30 },
      ],
      2,
    );
    expect(stock(step(circuit, initialResult(), 2))).toEqual([{ item: 'gunpowder', amount: 10 }]);
  });
  it('fullt lager förbrukar inget och tomgångstiden försvinner', () => {
    const { circuit, machine, stock } = setup(
      'furnace',
      [
        { item: 'metal.ore', amount: 2 },
        { item: 'metal.fragments', amount: 3000 },
      ],
      2,
    );
    let r = step(circuit, initialResult(), 1000);
    expect(stock(r)).toEqual(machine.data.settings.inventory);
    expect(r.nodeStates[machine.id].message).toContain('fullt');
    r.nodeStates[machine.id].inventory = r.nodeStates[machine.id].inventory.filter(
      (s) => s.slot !== 4,
    );
    r = step(circuit, r, 0.25);
    expect(stock(r)).toContainEqual({ item: 'metal.ore', amount: 2 });
    expect(stock(r)).toContainEqual({ item: 'metal.fragments', amount: 2000 });
  });
  it('saknade ingredienser skapar inga halvfärdiga eller gratis items', () => {
    const { circuit, machine, stock } = setup('crafter', [{ item: 'sulfur', amount: 100 }]);
    const r = step(circuit, initialResult(), 1000);
    expect(stock(r)).toEqual(machine.data.settings.inventory);
    expect(r.nodeStates[machine.id].message).toContain('ingredienser');
  });
  it('backup avvisar okända recept och fel workbench', () => {
    const { circuit, machine } = setup('crafter', []);
    machine.data.settings.recipe = 'invented';
    expect(() => validateCircuit(circuit)).toThrow('recept');
    machine.data.settings.recipe = 'gunpowder';
    machine.data.settings.workbench = 0;
    expect(() => validateCircuit(circuit)).toThrow('workbench');
  });
  it.each(['Industrial In', 'Blueprints In'])(
    'conveyor respekterar porten %s och ankomsttiden',
    (target) => {
      const { circuit, machine, power, stock } = setup('crafter', []);
      const source = newNode('box'),
        conveyor = newNode('conveyor');
      source.data.settings.inventory = [
        { item: 'sulfur', amount: 20 },
        { item: 'charcoal', amount: 30 },
      ];
      circuit.nodes.push(source, conveyor);
      circuit.edges.push({ ...circuit.edges[0], id: 'conveyor-power', target: conveyor.id });
      circuit.edges.push({
        id: 'pipe-in',
        type: 'wire',
        source: source.id,
        target: conveyor.id,
        sourceHandle: 'out:Industrial Out',
        targetHandle: 'in:Industrial Input',
        data: { color: '#ff444f', kind: 'industrial', waypoints: [] },
      });
      circuit.edges.push({
        id: 'pipe-out',
        type: 'wire',
        source: conveyor.id,
        target: machine.id,
        sourceHandle: 'out:Industrial Output',
        targetHandle: 'in:' + target,
        data: { color: '#ff444f', kind: 'industrial', waypoints: [] },
      });
      // Simulated steps match the worker's fixed cadence.
      let r = initialResult();
      for (let i = 0; i < 20; i++) r = step(circuit, r, 0.25);
      if (target === 'Blueprints In') {
        expect(stock(r)).toEqual([]);
        expect(r.transfers).toBe(0);
      } else {
        expect(stock(r)).toEqual(source.data.settings.inventory);
        expect(r.memory[machine.id].progress).toBe(0);
        r = step(circuit, r, 1.75);
        expect(stock(r).some((i) => i.item === 'gunpowder')).toBe(false);
        expect(stock(step(circuit, r, 0.25))).toEqual([{ item: 'gunpowder', amount: 10 }]);
      }
      expect(power.data.settings.enabled).toBe(true);
    },
  );
});
