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
    seconds: number;
    workbench: number;
    ingredients: { item: string; amount: number }[];
  }
> = {
  gunpowder: {
    output: 10,
    seconds: 2,
    workbench: 1,
    ingredients: [
      { item: 'sulfur', amount: 20 },
      { item: 'charcoal', amount: 30 },
    ],
  },
  'ammo.rifle': {
    output: 3,
    seconds: 10,
    workbench: 2,
    ingredients: [
      { item: 'metal.fragments', amount: 10 },
      { item: 'gunpowder', amount: 5 },
    ],
  },
  'syringe.medical': {
    output: 1,
    seconds: 10,
    workbench: 2,
    ingredients: [
      { item: 'cloth', amount: 15 },
      { item: 'metal.fragments', amount: 10 },
      { item: 'lowgradefuel', amount: 10 },
    ],
  },
};
