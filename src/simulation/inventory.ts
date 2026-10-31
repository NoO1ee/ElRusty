import type { ComponentNode, Stack } from '../model';
import { byDefinition } from '../data/catalog';
import { byItem, recipes } from '../data/items';
import { smelting } from '../data/production';

export type Compartment = 'input' | 'output' | 'blueprint';
export const layouts: Record<'furnace' | 'crafter', Record<Compartment, number[]>> = {
  furnace: { input: [0, 1], output: [2, 3, 4], blueprint: [] },
  crafter: { input: [0, 1, 2, 3, 4], output: [5, 6, 7, 8], blueprint: [9, 10, 11, 12] },
};
export const layout = (n: ComponentNode) =>
  layouts[byDefinition[n.data.definition].behavior as keyof typeof layouts];
export const sameItem = (a: Stack, b: Stack) =>
  a.item === b.item && !!a.blueprint === !!b.blueprint;
export const stackSize = (s: Pick<Stack, 'item' | 'blueprint'>) =>
  s.blueprint ? 1 : byItem[s.item]?.stack || 1;
export const countStock = (inv: Stack[], item: Stack) =>
  inv.reduce((sum, s) => sum + (sameItem(s, item) ? s.amount : 0), 0);
export const inCompartment = (n: ComponentNode, s: Stack, part: Compartment) =>
  !!layout(n)?.[part].includes(s.slot ?? -1);
export const blueprintRecipes = (n: ComponentNode, inv: Stack[]) =>
  inv
    .filter((s) => s.blueprint && inCompartment(n, s, 'blueprint'))
    .sort((a, b) => a.slot! - b.slot!)
    .map((s) => s.item);

export function roomFor(n: ComponentNode, inv: Stack[], item: Stack, part: Compartment = 'input') {
  const ranges = layout(n);
  if (ranges)
    return ranges[part].reduce((sum, slot) => {
      const s = inv.find((s) => s.slot === slot);
      return sum + (!s ? stackSize(item) : sameItem(s, item) ? stackSize(item) - s.amount : 0);
    }, 0);
  const used = inv.reduce((sum, s) => sum + Math.ceil(s.amount / stackSize(s)), 0);
  const count = countStock(inv, item),
    size = stackSize(item);
  return Math.max(
    0,
    (n.data.settings.slots - used) * size + (count % size ? size - (count % size) : 0),
  );
}
export function insertStock(
  n: ComponentNode,
  inv: Stack[],
  item: Stack,
  amount: number,
  part: Compartment = 'input',
) {
  const ranges = layout(n);
  let remaining = Math.min(amount, roomFor(n, inv, item, part));
  const moved = remaining;
  if (ranges) {
    // Top up existing stacks before allocating empty slots, preserving explicit slot order.
    for (const slot of [
      ...ranges[part].filter((slot) => inv.some((s) => s.slot === slot)),
      ...ranges[part].filter((slot) => !inv.some((s) => s.slot === slot)),
    ]) {
      if (!remaining) break;
      let s = inv.find((s) => s.slot === slot);
      if (s && !sameItem(s, item)) continue;
      if (!s) {
        s = { item: item.item, amount: 0, slot, ...(item.blueprint ? { blueprint: true } : {}) };
        inv.push(s);
      }
      const count = Math.min(remaining, stackSize(item) - s.amount);
      s.amount += count;
      remaining -= count;
    }
  } else {
    const s = inv.find((s) => sameItem(s, item));
    if (s) s.amount += remaining;
    else if (remaining)
      inv.push({
        item: item.item,
        amount: remaining,
        ...(item.blueprint ? { blueprint: true } : {}),
      });
  }
  return moved;
}
export function takeStock(inv: Stack[], item: Stack, amount: number, slots?: number[]) {
  for (const s of inv) {
    if (!sameItem(s, item) || (slots && !slots.includes(s.slot ?? -1))) continue;
    const take = Math.min(amount, s.amount);
    s.amount -= take;
    amount -= take;
    if (!amount) break;
  }
  for (let i = inv.length - 1; i >= 0; i--) if (!inv[i].amount) inv.splice(i, 1);
}
export function startBlueprints(n: ComponentNode): string[] {
  if (n.data.settings.blueprints !== undefined) return n.data.settings.blueprints;
  const explicit = n.data.settings.inventory.filter((s) => s.blueprint);
  if (explicit.length)
    return Array.from({ length: 4 }, (_, i) => explicit.find((s) => s.slot === i + 9)?.item ?? '');
  return [n.data.settings.recipe];
}
export function initialInventory(n: ComponentNode) {
  const inv: Stack[] = [],
    ranges = layout(n);
  if (!ranges) return structuredClone(n.data.settings.inventory);
  for (const original of n.data.settings.inventory) {
    if (
      byDefinition[n.data.definition].behavior === 'crafter' &&
      original.blueprint &&
      n.data.settings.blueprints !== undefined
    )
      continue;
    if (original.slot !== undefined) {
      inv.push({ ...original });
      continue;
    }
    const part: Compartment = original.blueprint
      ? 'blueprint'
      : byDefinition[n.data.definition].behavior === 'furnace'
        ? smelting[original.item]
          ? 'input'
          : 'output'
        : original.item === n.data.settings.recipe
          ? 'output'
          : 'input';
    const moved = insertStock(n, inv, original, original.amount, part);
    // Preserve legacy overflow instead of silently deleting items.
    if (moved < original.amount)
      inv.push({ ...original, amount: original.amount - moved, slot: -1 });
  }
  if (byDefinition[n.data.definition].behavior === 'crafter') {
    const explicit = inv.some((s) => s.blueprint);
    if (!explicit)
      for (const [i, item] of startBlueprints(n).entries()) {
        if (item) inv.push({ item, amount: 1, blueprint: true, slot: ranges.blueprint[i] });
      }
  }
  return inv.sort((a, b) => (a.slot ?? -1) - (b.slot ?? -1));
}
export function inventoryProblem(n: ComponentNode, inv: Stack[]) {
  const ranges = layout(n);
  if (!ranges) return '';
  const seen = new Set<number>();
  for (const s of inv) {
    const slot = s.slot ?? -1;
    if (slot < 0 || seen.has(slot) || s.amount > stackSize(s))
      return 'Startlagret ryms inte i maskinens platser. Redigera startlagret.';
    seen.add(slot);
    const allowed = s.blueprint ? ranges.blueprint : [...ranges.input, ...ranges.output];
    if (!allowed.includes(slot)) return 'Ett item ligger i fel lagerdel.';
    if (byDefinition[n.data.definition].behavior === 'furnace') {
      if (
        ranges.input.includes(slot)
          ? !smelting[s.item]
          : !Object.values(smelting).some((r) => r.item === s.item)
      )
        return 'Ugnen innehåller ett item som inte stöds i denna lagerdel.';
    }
  }
  return '';
}
export function accepts(n: ComponentNode, inv: Stack[], s: Stack, part: Compartment) {
  const behavior = byDefinition[n.data.definition].behavior;
  if (behavior === 'storage') return true;
  if (part === 'blueprint') return behavior === 'crafter' && !!s.blueprint;
  if (s.blueprint) return false;
  if (behavior === 'furnace')
    return part === 'input'
      ? !!smelting[s.item]
      : Object.values(smelting).some((r) => r.item === s.item);
  if (behavior === 'crafter')
    return part === 'input'
      ? blueprintRecipes(n, inv).some((id) =>
          recipes[id]?.ingredients.some((i) => i.item === s.item),
        )
      : true;
  return false;
}
