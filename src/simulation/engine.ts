import type { Circuit, SimulationResult, ComponentNode } from '../model';
import { byDefinition } from '../data/catalog';
import { runProduction } from './production';
import { initialInventory } from './inventory';
import { powerStatus } from './power-status';
import { transfer } from './transport';
export { TRANSFER_SECONDS, TRANSFER_BATCH } from './transport';
const key = (node: string, port: string) => node + '|' + port;
export const initialResult = (): SimulationResult => ({
  time: 0,
  nodeStates: {},
  outputs: {},
  warnings: [],
  transfers: 0,
  memory: {},
});
export function step(circuit: Circuit, previous: SimulationResult, dt = 0.25): SimulationResult {
  const result: SimulationResult = {
    time: previous.time + dt,
    nodeStates: {},
    outputs: {},
    warnings: [],
    transfers: previous.transfers,
    memory: structuredClone(previous.memory),
  };
  const nodes = circuit.nodes,
    edges = circuit.edges,
    byNode = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const incoming = (node: string, port: string, outputs: Record<string, number>) => {
    const e = edges.find(
      (e) => e.target === node && e.targetHandle === 'in:' + port && e.data?.kind === 'power',
    );
    return e ? outputs[key(e.source, e.sourceHandle || '')] || 0 : 0;
  };
  const state = (id: string) =>
    previous.memory[id] || {
      set: ['switch', 'conveyor', 'crafter'].includes(
        byDefinition[byNode[id].data.definition].behavior,
      )
        ? byNode[id].data.settings.enabled
        : false,
      until: 0,
      lastToggle: false,
      lastTrigger: false,
      progress: 0,
      pass: false,
    };
  const controlEnabled = (n: ComponentNode, read: (p: string) => number) => {
    let on = state(n.id).set;
    if (read('Turn On') || read('Switch On') || read('Toggle On')) on = true;
    if (read('Toggle') && !state(n.id).lastToggle) on = !on;
    if (read('Turn Off') || read('Switch Off') || read('Toggle Off')) on = false;
    return on;
  };
  let outputs: Record<string, number> = {};
  let stable = false;
  for (let pass = 0; pass < Math.max(8, Math.min(256, nodes.length * 3 + 8)); pass++) {
    const next: Record<string, number> = {};
    for (const n of nodes) {
      const d = byDefinition[n.data.definition],
        s = n.data.settings,
        mem = state(n.id),
        read = (p: string) => incoming(n.id, p, outputs),
        power = read('Power In');
      let out: Record<string, number> = {};
      const enabled = ['switch', 'conveyor', 'crafter'].includes(d.behavior)
        ? controlEnabled(n, read)
        : s.enabled;
      switch (d.behavior) {
        case 'source':
          out = { 'Power Out': s.enabled ? d.watts : 0 };
          break;
        case 'battery':
          out = { 'Power Output': s.enabled ? d.watts : 0, 'Fully Charged': s.enabled ? 1 : 0 };
          break;
        case 'combiner':
          out = { 'Combined Power Out': read('Root Power 1') + read('Root Power 2') };
          break;
        case 'branch': {
          const branch = Math.min(power, Math.max(2, s.branch));
          out = { 'Branch Out': branch, 'Power Out': Math.max(0, power - branch) };
          break;
        }
        case 'splitter': {
          const connected = d.ports.filter(
            (p) =>
              p.direction === 'out' &&
              edges.some((e) => e.source === n.id && e.sourceHandle === p.id),
          );
          const amount = connected.length ? Math.floor(power / connected.length) : 0;
          out = Object.fromEntries(connected.map((p) => [p.name, amount]));
          break;
        }
        case 'switch':
          out = { 'Power Out': enabled || read('Switch On') > 0 ? power : 0 };
          if (read('Switch Off')) out['Power Out'] = 0;
          break;
        case 'and':
          out = {
            'Power Out':
              read('Input A') && read('Input B') ? Math.max(read('Input A'), read('Input B')) : 0,
          };
          break;
        case 'or':
          out = { 'Power Out': Math.max(read('Input A'), read('Input B')) };
          break;
        case 'xor':
          out = {
            'Power Out':
              !!read('Input A') !== !!read('Input B')
                ? Math.max(read('Input A'), read('Input B'))
                : 0,
          };
          break;
        case 'blocker':
          out = { 'Power Out': read('Block Passthrough') ? 0 : power };
          break;
        case 'memory': {
          let set = mem.set;
          if (read('Set')) set = true;
          if (read('Toggle') && !mem.lastToggle) set = !set;
          if (read('Reset')) set = false;
          out = { Output: set ? power : 0, 'Inverted Output': set ? 0 : power };
          break;
        }
        case 'timer': {
          const until = read('Toggle On') && !mem.lastTrigger ? result.time + s.seconds : mem.until;
          out = { 'Power Out': enabled && result.time < until ? power : 0 };
          break;
        }
        case 'sensor':
          out = { 'Power Out': s.sensor ? Math.max(0, power - d.watts) : 0 };
          break;
        case 'consumer':
          out = { Passthrough: enabled ? Math.max(0, power - d.watts) : 0 };
          break;
        case 'crafter':
          break;
        case 'conveyor': {
          const active = enabled && power >= d.watts;
          out = {
            Passthrough: active ? Math.max(0, power - d.watts) : 0,
            'Filter Pass': active && mem.pass ? 1 : 0,
            'Filter Fail': active && !mem.pass ? 1 : 0,
          };
          break;
        }
      }
      for (const p of d.ports.filter((p) => p.direction === 'out' && p.kind === 'power'))
        next[key(n.id, p.id)] = Math.max(0, out[p.name] || 0);
    }
    if (JSON.stringify(next) === JSON.stringify(outputs)) {
      stable = true;
      outputs = next;
      break;
    }
    outputs = next;
  }
  result.outputs = outputs;
  if (!stable)
    result.warnings.push(
      'Instabil återkoppling: signalerna stabiliserades inte. Kontrollera slingan.',
    );
  for (const n of nodes) {
    const d = byDefinition[n.data.definition],
      s = n.data.settings,
      mem = state(n.id),
      read = (p: string) => incoming(n.id, p, outputs),
      power = read('Power In');
    const enabled = ['switch', 'conveyor', 'crafter'].includes(d.behavior)
      ? controlEnabled(n, read)
      : s.enabled;
    const active = ['source', 'battery'].includes(d.behavior)
      ? s.enabled
      : ['storage', 'industrialSplitter', 'industrialCombiner'].includes(d.behavior)
        ? true
        : ['and', 'or', 'xor', 'combiner'].includes(d.behavior)
          ? d.ports.some((p) => p.direction === 'out' && (outputs[key(n.id, p.id)] || 0) > 0)
          : power >= Math.max(1, d.watts) && enabled;
    const inventory = structuredClone(previous.nodeStates[n.id]?.inventory ?? initialInventory(n));
    result.nodeStates[n.id] = {
      input: power,
      active,
      message: powerStatus(d, power)
        ? (power === 0 ? 'Saknar ström' : 'För lite ström') +
          ` · ${power} / ${Math.max(1, d.watts)} rW`
        : !active && d.watts
          ? 'Avstängd'
          : '',
      inventory,
    };
    let set = ['switch', 'conveyor', 'crafter'].includes(d.behavior) ? enabled : mem.set;
    if (d.behavior === 'memory') {
      if (read('Set')) set = true;
      if (read('Toggle') && !mem.lastToggle) set = !set;
      if (read('Reset')) set = false;
    }
    result.memory[n.id] = {
      ...mem,
      set,
      lastToggle: !!read('Toggle'),
      lastTrigger: !!read('Toggle On'),
      until: read('Toggle On') && !mem.lastTrigger ? result.time + s.seconds : mem.until,
    };
  }
  // Produce from stock present at the start of the interval. Deliveries arrive at its end.
  for (const n of nodes) {
    if (['furnace', 'crafter'].includes(byDefinition[n.data.definition].behavior))
      runProduction(n, result.nodeStates[n.id], result.memory[n.id], dt);
  }
  transfer(circuit, previous, result);
  return result;
}
