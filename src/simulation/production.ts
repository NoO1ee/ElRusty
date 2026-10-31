import type { ComponentNode, SimulationResult } from '../model';
import { byItem, recipes } from '../data/items';
import { byDefinition } from '../data/catalog';
import { smelting } from '../data/production';
import {
  blueprintRecipes,
  countStock,
  inCompartment,
  insertStock,
  inventoryProblem,
  layout,
  roomFor,
  takeStock,
} from './inventory';
export { smelting } from '../data/production';
export const craftSeconds = (item: string, workbench: number) => recipes[item]?.times[workbench];
type Runtime = SimulationResult['nodeStates'][string];
type Memory = SimulationResult['memory'][string];

export function runProduction(n: ComponentNode, runtime: Runtime, mem: Memory, dt: number) {
  const problem = inventoryProblem(n, runtime.inventory);
  if (problem) {
    runtime.message = problem;
    return;
  }
  if (!runtime.active) return;
  if (byDefinition[n.data.definition].behavior === 'furnace')
    return runFurnace(n, runtime, mem, dt);
  let remaining = Math.max(0, dt);
  while (true) {
    const blueprints = blueprintRecipes(n, runtime.inventory);
    const inputs = runtime.inventory.filter((s) => inCompartment(n, s, 'input'));
    const item = blueprints.find((id) => {
      const r = recipes[id];
      return (
        r &&
        craftSeconds(id, n.data.settings.workbench) &&
        r.ingredients.every((i) => countStock(inputs, i) >= i.amount)
      );
    });
    if (!item) {
      mem.progress = 0;
      delete mem.productionItem;
      runtime.message = !blueprints.length
        ? 'Väntar på blueprint'
        : !blueprints.some((id) => recipes[id])
          ? 'Blueprintens recept stöds ännu inte'
          : !blueprints.some((id) => craftSeconds(id, n.data.settings.workbench))
            ? 'Workbench-nivån är för låg'
            : 'Väntar på ingredienser';
      return;
    }
    const r = recipes[item],
      seconds = craftSeconds(item, n.data.settings.workbench)!;
    if (mem.productionItem !== item) mem.progress = 0;
    mem.productionItem = item;
    const output = { item, amount: r.output };
    if (roomFor(n, runtime.inventory, output, 'output') < r.output) {
      runtime.message = 'Utmatningslagret är fullt';
      return;
    }
    const needed = seconds - mem.progress;
    if (remaining + 1e-9 < needed) {
      mem.progress += remaining;
      runtime.message = `Tillverkar ${byItem[item]?.name} · ${Math.floor((mem.progress / seconds) * 100)} %`;
      return;
    }
    for (const i of r.ingredients) takeStock(runtime.inventory, i, i.amount, layout(n).input);
    insertStock(n, runtime.inventory, output, r.output, 'output');
    remaining = Math.max(0, remaining - needed);
    mem.progress = 0;
  }
}

function runFurnace(n: ComponentNode, runtime: Runtime, mem: Memory, dt: number) {
  const progress = mem.smeltingProgress ?? (mem.smeltingProgress = {});
  let remaining = Math.max(0, dt);
  while (true) {
    const lanes = runtime.inventory.filter((s) => inCompartment(n, s, 'input') && smelting[s.item]);
    for (const slot of Object.keys(progress))
      if (!lanes.some((s) => s.slot === +slot && s.item === progress[+slot].item))
        delete progress[+slot];
    if (!lanes.length) {
      runtime.message = 'Väntar på smältbart material';
      return;
    }
    for (const s of lanes) progress[s.slot!] ??= { item: s.item, seconds: 0 };
    // A full output pauses the furnace; partial work is retained, idle time is not.
    if (
      lanes.some(
        (s) =>
          roomFor(n, runtime.inventory, { item: smelting[s.item].item, amount: 1 }, 'output') <
          smelting[s.item].output,
      )
    ) {
      runtime.message = 'Utmatningslagret är fullt';
      return;
    }
    const until = Math.min(
      ...lanes.map((s) => (smelting[s.item].seconds - progress[s.slot!].seconds) * lanes.length),
    );
    const elapsed = Math.min(remaining, Math.max(0, until));
    for (const s of lanes) progress[s.slot!].seconds += elapsed / lanes.length;
    remaining = Math.max(0, remaining - elapsed);
    if (elapsed + 1e-9 < until) {
      runtime.message = `Smälter · ${lanes.length} aktiva inmatningsplatser`;
      return;
    }
    for (const s of lanes) {
      const r = smelting[s.item];
      if (progress[s.slot!].seconds + 1e-9 < r.seconds) continue;
      if (roomFor(n, runtime.inventory, { item: r.item, amount: r.output }, 'output') < r.output) {
        runtime.message = 'Utmatningslagret är fullt';
        return;
      }
      takeStock(runtime.inventory, s, 1, [s.slot!]);
      insertStock(n, runtime.inventory, { item: r.item, amount: r.output }, r.output, 'output');
      progress[s.slot!].seconds = 0;
    }
  }
}
