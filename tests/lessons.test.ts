import { describe, it, expect } from 'vitest';
import { openExample } from '../src/data/examples';
import { step, initialResult } from '../src/simulation/engine';
import { withTestInputs } from '../src/simulation/test-inputs';
import { decodeBackup, encodeBackup, validateCircuit } from '../src/storage';
import type { Circuit, LogicComponent, SimulationResult } from '../src/model';
const inputs = (c: Circuit, area: number, values: boolean[]) =>
  Object.fromEntries(c.lesson!.areas[area].controls.map((x, i) => [x.nodeId, values[i] ?? false]));
const lit = (c: Circuit, area: number, r: SimulationResult) =>
  r.nodeStates[c.lesson!.areas[area].outputNodeId].active;
const expected: Record<string, ((v: boolean[]) => boolean)[]> = {
  or: [([a, b]) => a || b, ([a, b, c]) => a || b || c, ([a, b, c]) => (a || b) && !c],
  and: [([a, b]) => a && b, ([a, b, c]) => a && b && c, ([a, b, c]) => (a || b) && c],
  xor: [([a, b]) => a !== b, ([a, b, c]) => a !== b && c, ([a, b, c, d]) => (a && b) !== (c && d)],
  blocker: [([a, b]) => a && !b, ([a, b]) => !a && !b, ([a, b, c]) => a && !(b || c)],
};
describe('nivåindelade logiklektioner', () => {
  for (const component of ['or', 'and', 'xor', 'blocker'] as const)
    for (const level of [0, 1, 2])
      it(`${component}, nivå ${level + 1}: alla signalkombinationer ger rätt resultat`, () => {
        const c = openExample('learn-' + component),
          area = c.lesson!.areas[level];
        for (let mask = 0; mask < 1 << area.controls.length; mask++) {
          const v = area.controls.map((_, i) => !!(mask & (1 << i)));
          const r = step(withTestInputs(c, inputs(c, level, v)), initialResult(), 0);
          expect(lit(c, level, r), JSON.stringify(v)).toBe(expected[component][level](v));
          expect(r.warnings).toEqual([]);
        }
      });
  it.each(['or', 'and', 'xor', 'blocker', 'memory'] as LogicComponent[])(
    '%s har exakt tre separata områden med giltiga och nya referenser',
    (component) => {
      const c = openExample('learn-' + component),
        copy = openExample('learn-' + component);
      expect(() => validateCircuit(c)).not.toThrow();
      expect(c.lesson!.areas.map((a) => a.title)).toEqual(['Grund', 'Mellan', 'Avancerad']);
      for (const area of c.lesson!.areas) {
        expect(c.nodes.some((n) => n.id === area.focusNodeId)).toBe(true);
        expect(c.nodes.some((n) => n.id === area.outputNodeId)).toBe(true);
        for (const control of area.controls)
          expect(c.nodes.some((n) => n.id === control.nodeId)).toBe(true);
        expect(copy.lesson!.areas.flatMap((a) => a.controls.map((x) => x.nodeId))).not.toContain(
          area.controls[0].nodeId,
        );
      }
      expect(decodeBackup(encodeBackup('circuit', c)).payload).toMatchObject({ lesson: c.lesson });
    },
  );
  it.each(['or', 'and'] as const)(
    '%s använder högsta effekten och adderar inte ingångarna',
    (component) => {
      const c = openExample('learn-' + component),
        r = step(withTestInputs(c, inputs(c, 0, [true, true])), initialResult(), 0);
      expect(r.outputs[c.lesson!.areas[0].focusNodeId + '|out:Power Out']).toBe(40);
    },
  );
  it('Memory Cell behåller Set efter släppt signal och Reset återställer', () => {
    const c = openExample('learn-memory');
    let r = step(c, initialResult(), 0);
    expect(lit(c, 0, r)).toBe(false);
    r = step(withTestInputs(c, inputs(c, 0, [true, false])), r, 0);
    expect(lit(c, 0, r)).toBe(true);
    r = step(withTestInputs(c, inputs(c, 0, [false, false])), r, 0);
    expect(lit(c, 0, r)).toBe(true);
    r = step(withTestInputs(c, inputs(c, 0, [false, true])), r, 0);
    expect(lit(c, 0, r)).toBe(false);
    expect(r.time).toBe(0);
  });
  it('Toggle växlar bara på stigande kant', () => {
    const c = openExample('learn-memory');
    let r = initialResult();
    for (const [v, out] of [
      [true, true],
      [true, true],
      [false, true],
      [true, false],
    ] as const) {
      r = step(withTestInputs(c, inputs(c, 1, [v])), r, 0);
      expect(lit(c, 1, r)).toBe(out);
    }
  });
  it('avancerat minne kan tystas utan att den lagrade händelsen försvinner', () => {
    const c = openExample('learn-memory');
    let r = initialResult();
    for (const [v, out, memory] of [
      [[true, false, false, false], true, true],
      [[false, false, false, false], true, true],
      [[false, false, false, true], false, true],
      [[false, false, false, false], true, true],
      [[false, false, true, false], false, false],
    ] as [boolean[], boolean, boolean][]) {
      r = step(withTestInputs(c, inputs(c, 2, v)), r, 0);
      expect(lit(c, 2, r)).toBe(out);
      expect(r.memory[c.lesson!.areas[2].focusNodeId].set).toBe(memory);
    }
  });
  it('testsignaler skriver inte över sparade inställningar och kan bara styra lektionskällor', () => {
    const c = openExample('learn-and'),
      before = structuredClone(c),
      id = c.lesson!.areas[0].controls[0].nodeId;
    const other = c.nodes.find((n) => n.data.definition === 'simple-light')!;
    const changed = withTestInputs(c, { [id]: true, [other.id]: false });
    expect(changed.nodes.find((n) => n.id === id)!.data.settings.enabled).toBe(true);
    expect(changed.nodes.find((n) => n.id === other.id)!.data.settings.enabled).toBe(true);
    expect(c).toEqual(before);
  });
  it('avvisar felaktiga lektionsdata utan att ändra originalet', () => {
    const c = openExample('learn-or');
    c.lesson!.areas[0].width = Infinity;
    expect(() => validateCircuit(c)).toThrow('lektionsområde');
  });
});
