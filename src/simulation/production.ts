import type { ComponentNode, SimulationResult, Stack } from '../model';
import { byItem, recipes } from '../data/items';
import { byDefinition } from '../data/catalog';

// Facepunch item/electric.furnace Processes table, checked 2026-10-31.
// One serial production queue; mixed-slot scheduling remains a model assumption.
export const smelting: Record<string, { item: string; output: number; seconds: number }> = {
  'metal.ore': { item: 'metal.fragments', output: 1, seconds: 2 },
  'sulfur.ore': { item: 'sulfur', output: 1, seconds: 1 },
  'hq.metal.ore': { item: 'metal.refined', output: 1, seconds: 4 },
};
export const craftSeconds = (item: string, workbench: number) => recipes[item]?.times[workbench];
type Runtime = SimulationResult['nodeStates'][string];
type Memory = SimulationResult['memory'][string];
const count = (inv: Stack[], item: string) =>
  inv.reduce((sum, s) => sum + (s.item === item ? s.amount : 0), 0);
const slotsUsed = (inv: Stack[]) =>
  inv.reduce((sum, s) => sum + Math.ceil(s.amount / (byItem[s.item]?.stack || 1)), 0);
function change(inv: Stack[], item: string, amount: number) {
  const stack = inv.find((s) => s.item === item);
  if (stack) stack.amount += amount;
  else inv.push({ item, amount });
  return inv.filter((s) => s.amount > 0);
}

/** Atomic inventory transactions: failed batches consume neither items nor time.
 * Idle time is discarded; a powered-off machine preserves only partial work.
 */
export function runProduction(node: ComponentNode, runtime: Runtime, mem: Memory, dt: number) {
  const furnace = byDefinition[node.data.definition].behavior === 'furnace';
  const s = node.data.settings;
  if (!runtime.active) return;
  let remaining = Math.max(0, dt);
  while (true) {
    const item = furnace ? runtime.inventory.find((i) => smelting[i.item])?.item : s.recipe;
    const recipe = furnace ? (item ? smelting[item] : undefined) : recipes[s.recipe];
    const seconds = furnace
      ? item
        ? smelting[item]?.seconds
        : undefined
      : craftSeconds(s.recipe, s.workbench);
    const clear = (message: string) => {
      mem.progress = 0;
      delete mem.productionItem;
      runtime.message = message;
    };
    if (!recipe || !item) return clear(furnace ? 'Väntar på malm' : 'Okänt recept');
    if (!seconds) return clear('Workbench-nivån är för låg');
    const ingredients = furnace ? [{ item, amount: 1 }] : recipes[item].ingredients;
    const output = furnace ? smelting[item].item : item;
    if (mem.productionItem !== item) mem.progress = 0;
    mem.productionItem = item;
    const batchesAvailable = Math.min(
      ...ingredients.map((i) => Math.floor(count(runtime.inventory, i.item) / i.amount)),
    );
    if (!batchesAvailable) return clear('Väntar på ingredienser');

    // Capacity is tested after consuming ingredients, so a freed slot can hold output.
    const transaction = (inv: Stack[], batches: number) => {
      let next = inv.map((i) => ({ ...i }));
      for (const i of ingredients) next = change(next, i.item, -i.amount * batches);
      return change(next, output, recipe.output * batches);
    };
    const next = transaction(runtime.inventory, 1);
    if (slotsUsed(next) > s.slots) break;
    const needed = Math.max(0, seconds - mem.progress);
    if (remaining + 1e-9 >= needed) {
      runtime.inventory = next;
      remaining = Math.max(0, remaining - needed);
      mem.progress = 0;
      continue;
    }
    mem.progress += remaining;
    runtime.message = `${furnace ? 'Smälter' : 'Tillverkar'} ${byItem[output]?.name || output} · ${Math.floor((mem.progress / seconds) * 100)} %`;
    return;
  }
  mem.progress = 0;
  delete mem.productionItem;
  runtime.message = 'Utmatningslagret är fullt';
}
