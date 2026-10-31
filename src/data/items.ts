import raw from './items.json';
import type { Item } from '../model';
import { categoryIds } from './categories';
export const items: Item[] = raw.map((i) => ({ ...i, categoryId: categoryIds[i.category] }));
export const byItem: Record<string, Item> = Object.fromEntries(items.map((i) => [i.id, i]));
export const categories = [
  'Weapon',
  'Construction',
  'Items',
  'Resources',
  'Attire',
  'Tool',
  'Medical',
  'Food',
  'Ammunition',
  'Traps',
  'Misc',
  'Component',
  'Electrical',
  'Fun',
];
export const categoryLabels: Record<string, string> = {
  Weapon: 'Weapons',
  Attire: 'Clothing',
  Tool: 'Tools',
  Ammunition: 'Ammo',
  Component: 'Components',
  Misc: 'Other',
};
export const recipes: Record<
  string,
  {
    output: number;
    workbench: number;
    times: Partial<Record<number, number>>;
    source: string;
    ingredients: { item: string; amount: number }[];
  }
> = {
  gunpowder: {
    output: 10,
    workbench: 1,
    times: { 1: 2, 2: 1, 3: 1 },
    source: 'https://wiki.facepunch.com/rust/item/gunpowder',
    ingredients: [
      { item: 'sulfur', amount: 20 },
      { item: 'charcoal', amount: 30 },
    ],
  },
  'ammo.rifle': {
    output: 3,
    workbench: 2,
    times: { 2: 3, 3: 1 },
    source: 'https://wiki.facepunch.com/rust/item/ammo.rifle',
    ingredients: [
      { item: 'metal.fragments', amount: 10 },
      { item: 'gunpowder', amount: 5 },
    ],
  },
  'syringe.medical': {
    output: 1,
    workbench: 2,
    times: { 2: 10, 3: 5 },
    source: 'https://wiki.facepunch.com/rust/item/syringe.medical',
    ingredients: [
      { item: 'cloth', amount: 15 },
      { item: 'metal.fragments', amount: 10 },
      { item: 'lowgradefuel', amount: 10 },
    ],
  },
};
