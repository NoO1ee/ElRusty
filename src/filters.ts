import type { ConveyorFilter, FilterRule, Item } from './model';
import { validCategoryIds } from './data/categories';
export const MAX_FILTER_RULES = 30;
export interface RustFilterEntry {
  TargetCategory: number | null;
  MaxAmountInOutput: number;
  BufferAmount: number;
  MinAmountInInput: number;
  IsBlueprint: boolean;
  TargetItemName: string;
}
export function matchRule(rule: FilterRule, item: Item) {
  return (
    !rule.blueprint &&
    ((rule.item !== null && rule.item === item.id) ||
      (rule.category !== null && rule.category === item.categoryId))
  );
}
export function exportRustFilter(filter: ConveyorFilter): string {
  validateRules(filter.rules);
  return JSON.stringify(
    filter.rules.map(
      (r) =>
        ({
          TargetCategory: r.category,
          MaxAmountInOutput: r.max,
          BufferAmount: r.buffer,
          MinAmountInInput: r.min,
          IsBlueprint: r.blueprint,
          TargetItemName: r.item ?? '',
        }) satisfies RustFilterEntry,
    ),
    null,
    2,
  );
}
export function validateRules(rules: FilterRule[]) {
  if (!Array.isArray(rules) || rules.length > MAX_FILTER_RULES)
    throw new Error('Filtret får ha högst 30 regler.');
  for (const r of rules) {
    if ((r.item === null) === (r.category === null))
      throw new Error('Välj antingen item eller kategori för varje regel.');
    if (r.item !== null && (typeof r.item !== 'string' || !r.item.trim()))
      throw new Error('Ogiltigt item.');
    if (r.category !== null && (!Number.isInteger(r.category) || !validCategoryIds.has(r.category)))
      throw new Error('Ogiltig kategori.');
    for (const n of [r.min, r.max, r.buffer])
      if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('Mängder måste vara positiva heltal eller 0.');
    if (typeof r.blueprint !== 'boolean') throw new Error('Ogiltigt blueprint-värde.');
  }
}
export function importRustFilter(text: string): FilterRule[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Rust-filtret måste vara en JSON-lista.');
  const rules = parsed.map((x: RustFilterEntry) => ({
    item: x.TargetCategory === null ? x.TargetItemName : null,
    category: x.TargetCategory,
    min: x.MinAmountInInput,
    max: x.MaxAmountInOutput,
    buffer: x.BufferAmount,
    blueprint: x.IsBlueprint,
  }));
  validateRules(rules);
  return rules;
}
