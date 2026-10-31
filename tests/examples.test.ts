import { describe, it, expect } from 'vitest';
import { exampleBuilds, openExample } from '../src/data/examples';
import { validateCircuit, encodeBackup, decodeBackup } from '../src/storage';
import { byDefinition, nodeHeight, NODE_WIDTH } from '../src/data/catalog';
import { initialResult, step } from '../src/simulation/engine';
import type { Circuit, SimulationResult } from '../src/model';
const node = (c: Circuit, label: string) => c.nodes.find((n) => n.data.label === label)!;
const output = (c: Circuit, r: SimulationResult, id: string, port: string) =>
  r.outputs[c.nodes.find((n) => n.data.label === id)!.id + '|out:' + port];
describe('exempelbibliotek', () => {
  it('har unika poster och källhänvisningar inklusive den delade NEXUS-kretsen', () => {
    expect(exampleBuilds).toHaveLength(14);
    expect(new Set(exampleBuilds.map((e) => e.id)).size).toBe(14);
    const nexus = openExample('nexus');
    expect(nexus.nodes).toHaveLength(24);
    expect(nexus.edges).toHaveLength(32);
    expect(nexus.example?.mode).toBe('reference');
    expect(
      exampleBuilds
        .filter((e) => e.origin === 'Handboken')
        .every((e) => e.source?.url.startsWith('https:') && e.author.length),
    ).toBe(true);
  });
  it.each(exampleBuilds.filter((e) => e.create).map((e) => [e.id]))(
    '%s har giltiga och unikt anslutna portar samt kort utan överlapp',
    (id) => {
      const c = openExample(id);
      expect(() => validateCircuit(c)).not.toThrow();
      for (let i = 0; i < c.nodes.length; i++)
        for (let j = i + 1; j < c.nodes.length; j++) {
          const a = c.nodes[i],
            b = c.nodes[j];
          expect(
            a.position.x + NODE_WIDTH <= b.position.x ||
              b.position.x + NODE_WIDTH <= a.position.x ||
              a.position.y + nodeHeight(byDefinition[a.data.definition]) <= b.position.y ||
              b.position.y + nodeHeight(byDefinition[b.data.definition]) <= a.position.y,
          ).toBe(true);
        }
    },
  );
  it('öppnar oberoende kopior med nya krets-, komponent- och kabel-ID:n', () => {
    const a = openExample('bcn-core'),
      b = openExample('bcn-core');
    expect(a.id).not.toBe(b.id);
    expect(a.nodes.every((n) => !b.nodes.some((m) => m.id === n.id))).toBe(true);
    expect(a.edges.every((n) => !b.edges.some((m) => m.id === n.id))).toBe(true);
    a.nodes[0].position.x = 999;
    a.example!.steps[0] = 'ändrad';
    expect(b.nodes[0].position.x).toBe(0);
    expect(openExample('bcn-core').example!.steps[0]).not.toBe('ändrad');
  });
  it.each(['nih-core', 'bcn-core', 'nexus', 'inline'])(
    '%s räknas inte som en fungerande simulering',
    (id) => {
      const c = openExample(id),
        r = step(c, initialResult(), 100);
      expect(r.time).toBe(0);
      expect(r.outputs).toEqual({});
      expect(r.warnings[0]).toContain('Kopplingsreferens');
      expect(Object.values(r.nodeStates).every((n) => !n.active)).toBe(true);
    },
  );
  it('bevarar guide, källa, kabeldata och rollnamn i backup', () => {
    const c = openExample('nih-core'),
      restored = decodeBackup(encodeBackup('circuit', c)).payload as Circuit;
    expect(restored.example).toEqual(c.example);
    expect(restored.nodes).toEqual(c.nodes);
    expect(restored.edges).toEqual(c.edges);
    c.example!.source!.url = 'javascript:alert(1)';
    expect(() => validateCircuit(c)).toThrow('exempellänk');
  });
  it('reserverar kritisk effekt även när huvudkällan försvinner', () => {
    const c = openExample('priority-backup');
    let r = step(c, initialResult());
    expect(output(c, r, 'Välj högsta tillgängliga effekt', 'Power Out')).toBe(150);
    node(c, 'Ordinarie matning').data.settings.enabled = false;
    r = step(c, r);
    expect(output(c, r, 'Välj högsta tillgängliga effekt', 'Power Out')).toBe(100);
    for (let i = 1; i <= 3; i++)
      expect(r.nodeStates[node(c, 'Kritisk last ' + i).id].active).toBe(true);
    node(c, 'Reservmatning').data.settings.enabled = false;
    r = step(c, r);
    expect(r.nodeStates[node(c, 'Kritisk last 1').id].active).toBe(false);
  });
  it('larmet låser en händelse och kan återställas genom Reset', () => {
    const c = openExample('latched-alarm');
    let r = step(c, initialResult());
    const alarm = node(c, 'Larmindikering');
    expect(r.nodeStates[alarm.id].active).toBe(false);
    node(c, 'Manuell testhändelse').data.settings.sensor = true;
    r = step(c, r);
    expect(r.nodeStates[alarm.id].active).toBe(true);
    node(c, 'Manuell testhändelse').data.settings.sensor = false;
    r = step(c, r);
    expect(r.nodeStates[alarm.id].active).toBe(true);
    r.memory[node(c, 'Återställ larm').id].set = true;
    r = step(c, r);
    expect(r.nodeStates[alarm.id].active).toBe(false);
  });
  it('timerfönstret stängs efter fem sekunder även om startsignalen är hög', () => {
    const c = openExample('timed-light'),
      lamp = node(c, 'Tillfällig belysning');
    node(c, 'Starta med en stigande signal').data.settings.enabled = true;
    let r = step(c, initialResult());
    expect(r.nodeStates[lamp.id].active).toBe(true);
    for (let i = 0; i < 20; i++) r = step(c, r);
    expect(r.nodeStates[lamp.id].active).toBe(false);
  });
  it('en sektor kan kopplas bort utan att slå ut den andra', () => {
    const c = openExample('isolated-sectors');
    node(c, 'Servicebrytare · sektor 1').data.settings.enabled = false;
    const r = step(c, initialResult());
    expect(r.nodeStates[node(c, 'Belysning · sektor 1').id].active).toBe(false);
    expect(r.nodeStates[node(c, 'Belysning · sektor 2').id].active).toBe(true);
  });
  it('smältlinjen flyttar och omvandlar råmaterial utan förlust', () => {
    const c = openExample('auto-smelter');
    let r = initialResult();
    for (let i = 0; i < 500; i++) r = step(c, r);
    const inv = Object.values(r.nodeStates).flatMap((n) => n.inventory);
    expect(inv.reduce((sum, s) => sum + s.amount, 0)).toBe(120);
    expect(
      r.nodeStates[node(c, 'Färdigt material').id].inventory.find(
        (s) => s.item === 'metal.fragments',
      )?.amount,
    ).toBeGreaterThan(0);
    expect(r.warnings).toEqual([]);
  });
  it('Branch stöder 1 rW enligt kärnornas dokumenterade kontrollväg', () => {
    const c = openExample('nih-core');
    expect(c.nodes.find((n) => n.data.label === '2 · Närvarosignal')?.data.settings.branch).toBe(1);
    delete c.example;
    const r = step(c, initialResult());
    expect(output(c, r, '2 · Närvarosignal', 'Branch Out')).toBe(1);
  });
});
