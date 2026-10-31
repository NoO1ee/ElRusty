import type { Circuit, FilterRule, SimulationResult, Stack } from '../model';
import { byDefinition } from '../data/catalog';
import { byItem } from '../data/items';
import { matchRule } from '../filters';
import {
  accepts,
  countStock,
  inCompartment,
  insertStock,
  layout,
  roomFor,
  takeStock,
  type Compartment,
} from './inventory';
export const TRANSFER_SECONDS = 5,
  TRANSFER_BATCH = 128;
export function transfer(circuit: Circuit, previous: SimulationResult, result: SimulationResult) {
  if (Math.floor(result.time / TRANSFER_SECONDS) <= Math.floor(previous.time / TRANSFER_SECONDS))
    return;
  const byNode = Object.fromEntries(circuit.nodes.map((n) => [n.id, n]));
  type Endpoint = { id: string; part: Compartment };
  function reachable(id: string, direction: 'up' | 'down') {
    const found = new Map<string, Endpoint>(),
      visited = new Set<string>();
    function walk(current: string, depth: number) {
      if (depth > 32 || visited.has(current)) return;
      visited.add(current);
      for (const e of circuit.edges.filter(
        (e) =>
          e.data?.kind === 'industrial' &&
          (direction === 'up' ? e.target === current : e.source === current),
      )) {
        const id = direction === 'up' ? e.source : e.target,
          n = byNode[id];
        if (!n) continue;
        const behavior = byDefinition[n.data.definition].behavior;
        if (['storage', 'furnace', 'crafter'].includes(behavior)) {
          const port = direction === 'up' ? e.sourceHandle : e.targetHandle;
          const part: Compartment =
            behavior === 'crafter' && ['out:Blueprint Out', 'in:Blueprints In'].includes(port || '')
              ? 'blueprint'
              : direction === 'up'
                ? 'output'
                : 'input';
          found.set(id + '|' + part, { id, part });
        } else if (['industrialSplitter', 'industrialCombiner'].includes(behavior))
          walk(id, depth + 1);
      }
    }
    walk(id, 0);
    return [...found.values()];
  }
  const stock = (e: Endpoint) =>
    result.nodeStates[e.id].inventory.filter(
      (s) => !layout(byNode[e.id]) || inCompartment(byNode[e.id], s, e.part),
    );
  for (const conveyor of circuit.nodes.filter(
    (n) => byDefinition[n.data.definition].behavior === 'conveyor',
  )) {
    if (!result.nodeStates[conveyor.id].active) continue;
    let moved = false;
    const sources = reachable(conveyor.id, 'up'),
      targets = reachable(conveyor.id, 'down'),
      filter = conveyor.data.settings.filter;
    const matching = (rule: FilterRule, s: Stack) =>
      !!byItem[s.item] && matchRule(rule, byItem[s.item], !!s.blueprint);
    if (
      filter.mode === 'all' &&
      !filter.rules.every((r) =>
        sources.some((e) => stock(e).some((s) => matching(r, s) && s.amount > r.min)),
      )
    ) {
      result.memory[conveyor.id].pass = false;
      continue;
    }
    for (const src of sources) {
      const inv = result.nodeStates[src.id].inventory;
      const identities = stock(src).filter(
        (s, i, all) =>
          all.findIndex((t) => t.item === s.item && !!t.blueprint === !!s.blueprint) === i,
      );
      for (const item of identities) {
        const matches = filter.rules.filter((r) => matching(r, item));
        if (
          filter.rules.length &&
          (filter.mode === 'exclude' ? matches.length > 0 : !matches.length)
        )
          continue;
        const foundRule = filter.mode === 'exclude' ? undefined : matches[0];
        const r = filter.mode === 'all' && foundRule ? { ...foundRule, min: 0, max: 0 } : foundRule;
        const available = Math.max(0, countStock(stock(src), item) - (r?.min || 0));
        const buffers =
          result.memory[conveyor.id].buffers ?? (result.memory[conveyor.id].buffers = {});
        const bufferKey = src.id + '|' + src.part + '|' + item.item + '|' + !!item.blueprint;
        if (r?.buffer && !(buffers[bufferKey] > 0)) {
          if (available < r.buffer) continue;
          buffers[bufferKey] = r.buffer;
        }
        let budget = Math.min(TRANSFER_BATCH, available, r?.buffer ? buffers[bufferKey] : Infinity);
        const destinations = targets.filter(
          (t) =>
            t.id !== src.id &&
            accepts(byNode[t.id], result.nodeStates[t.id].inventory, item, t.part),
        );
        for (let i = 0; i < destinations.length && budget > 0; i++) {
          const dest = destinations[i],
            node = byNode[dest.id],
            targetInv = result.nodeStates[dest.id].inventory;
          const maxRoom = r?.max ? Math.max(0, r.max - countStock(stock(dest), item)) : Infinity;
          const amount = Math.min(
            budget,
            Math.ceil(budget / (destinations.length - i)),
            roomFor(node, targetInv, item, dest.part),
            maxRoom,
          );
          if (amount <= 0) continue;
          insertStock(node, targetInv, item, amount, dest.part);
          takeStock(inv, item, amount, layout(byNode[src.id])?.[src.part]);
          budget -= amount;
          if (r?.buffer) buffers[bufferKey] -= amount;
          result.transfers += amount;
          moved = true;
        }
      }
    }
    result.memory[conveyor.id].pass = moved;
  }
}
