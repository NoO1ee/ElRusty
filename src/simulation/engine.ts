import type { Circuit, SimulationResult, Stack, ComponentNode, FilterRule } from '../model';
import { byDefinition } from '../data/catalog';
import { byItem, recipes } from '../data/items';
import { matchRule } from '../filters';
import { runProduction, smelting } from './production';
export const TRANSFER_SECONDS = 5,
  TRANSFER_BATCH = 128;
const key = (node: string, port: string) => node + '|' + port;
export const initialResult = (): SimulationResult => ({
  time: 0,
  nodeStates: {},
  outputs: {},
  warnings: [],
  transfers: 0,
  memory: {},
});
const count = (inv: Stack[], item: string) =>
  inv.filter((s) => s.item === item).reduce((n, s) => n + s.amount, 0);
function room(inv: Stack[], item: string, slots: number) {
  const used = inv.reduce((n, s) => n + Math.ceil(s.amount / (byItem[s.item]?.stack || 1)), 0);
  const current = count(inv, item),
    stack = byItem[item]?.stack || 1;
  return Math.max(0, (slots - used) * stack + (current % stack ? stack - (current % stack) : 0));
}
function adjust(inv: Stack[], item: string, delta: number) {
  const s = inv.find((s) => s.item === item);
  if (s) s.amount += delta;
  else if (delta > 0) inv.push({ item, amount: delta });
  for (let i = inv.length - 1; i >= 0; i--) if (inv[i].amount <= 0) inv.splice(i, 1);
}
function inventoryAllowed(n: ComponentNode, item: string, direction: 'in' | 'out') {
  const d = byDefinition[n.data.definition];
  if (d.behavior === 'furnace')
    return direction === 'in'
      ? !!smelting[item]
      : ['metal.fragments', 'sulfur', 'metal.refined'].includes(item);
  if (d.behavior === 'crafter') {
    const r = recipes[n.data.settings.recipe];
    return direction === 'out'
      ? item === n.data.settings.recipe
      : !!r?.ingredients.some((i) => i.item === item);
  }
  return true;
}
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
        case 'furnace':
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
    const inventory = structuredClone(previous.nodeStates[n.id]?.inventory ?? s.inventory);
    result.nodeStates[n.id] = {
      input: power,
      active,
      message: !active && d.watts ? 'Otillräcklig ström eller avstängd' : '',
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
  // Only traverse industrial plumbing. Another conveyor is a boundary, never a passive pipe.
  function reachable(id: string, dir: 'up' | 'down') {
    const found = new Set<string>(),
      visited = new Set<string>();
    function walk(node: string, depth: number) {
      if (depth > 32 || visited.has(node)) return;
      visited.add(node);
      const es = edges.filter(
        (e) =>
          e.data?.kind === 'industrial' && (dir === 'up' ? e.target === node : e.source === node),
      );
      for (const e of es) {
        const next = dir === 'up' ? e.source : e.target,
          n = byNode[next];
        if (!n) continue;
        const behavior = byDefinition[n.data.definition].behavior;
        if (
          behavior === 'crafter' &&
          (dir === 'up'
            ? e.sourceHandle === 'out:Blueprint Out'
            : e.targetHandle === 'in:Blueprints In')
        )
          continue;
        if (['storage', 'furnace', 'crafter'].includes(behavior)) {
          found.add(next);
          continue;
        }
        if (behavior === 'industrialCombiner' || behavior === 'industrialSplitter')
          walk(next, depth + 1);
      }
    }
    walk(id, 0);
    return [...found];
  }
  // Produce from stock present at the start of the interval. Deliveries arrive at its end.
  for (const n of nodes) {
    if (['furnace', 'crafter'].includes(byDefinition[n.data.definition].behavior))
      runProduction(n, result.nodeStates[n.id], result.memory[n.id], dt);
  }
  const transferTick =
    Math.floor(result.time / TRANSFER_SECONDS) > Math.floor(previous.time / TRANSFER_SECONDS);
  if (transferTick)
    for (const n of nodes.filter((n) => byDefinition[n.data.definition].behavior === 'conveyor')) {
      const runtime = result.nodeStates[n.id];
      if (!runtime.active) continue;
      let moved = false;
      const sources = reachable(n.id, 'up'),
        targets = reachable(n.id, 'down'),
        filter = n.data.settings.filter;
      const available = (rule: FilterRule) =>
        sources.some((id) =>
          result.nodeStates[id].inventory.some(
            (s) => byItem[s.item] && matchRule(rule, byItem[s.item]) && s.amount > rule.min,
          ),
        );
      if (filter.mode === 'all' && !filter.rules.every(available)) {
        result.memory[n.id].pass = false;
        continue;
      }
      for (const sid of sources) {
        const src = result.nodeStates[sid].inventory;
        for (const stack of [...src]) {
          const item = byItem[stack.item];
          if (!item || !inventoryAllowed(byNode[sid], item.id, 'out')) continue;
          const matching = filter.rules.filter((r) => matchRule(r, item));
          if (
            filter.rules.length &&
            (filter.mode === 'exclude' ? matching.length > 0 : matching.length === 0)
          )
            continue;
          const foundRule = filter.mode === 'exclude' ? undefined : matching[0];
          const r =
            filter.mode === 'all' && foundRule ? { ...foundRule, min: 0, max: 0 } : foundRule;
          const availableAmount = Math.max(0, stack.amount - (r?.min || 0));
          const buffers = result.memory[n.id].buffers ?? (result.memory[n.id].buffers = {});
          const bufferKey = sid + '|' + item.id;
          if (r?.buffer && !(buffers[bufferKey] > 0)) {
            if (availableAmount < r.buffer) continue;
            buffers[bufferKey] = r.buffer;
          }
          let budget = Math.min(
            TRANSFER_BATCH,
            availableAmount,
            r?.buffer ? buffers[bufferKey] : Infinity,
          );
          const destinations = targets.filter(
            (t) => t !== sid && inventoryAllowed(byNode[t], item.id, 'in'),
          );
          for (let ti = 0; ti < destinations.length && budget > 0; ti++) {
            const tid = destinations[ti],
              dest = result.nodeStates[tid].inventory;
            const maxRoom = r?.max ? Math.max(0, r.max - count(dest, item.id)) : Infinity;
            let amount = Math.min(
              budget,
              Math.ceil(budget / (destinations.length - ti)),
              room(dest, item.id, byNode[tid].data.settings.slots),
              maxRoom,
            );
            if (amount > 0) {
              adjust(src, item.id, -amount);
              adjust(dest, item.id, amount);
              budget -= amount;
              if (r?.buffer) buffers[bufferKey] -= amount;
              result.transfers += amount;
              moved = true;
            }
          }
        }
      }
      result.memory[n.id].pass = moved;
    }
  return result;
}
