// Rust's enum is sparse. Never derive these values from a dropdown's index.
// Cross-checked against https://github.com/tostesdaniel/rust-conveyor-filters/blob/main/src/db/seed-data/categories.json
export const categoryIds: Record<string, number> = {
  Weapon: 0,
  Construction: 1,
  Items: 2,
  Resources: 3,
  Attire: 4,
  Tool: 5,
  Medical: 6,
  Food: 7,
  Ammunition: 8,
  Traps: 9,
  Misc: 10,
  Component: 13,
  Electrical: 16,
  Fun: 17,
};
export const validCategoryIds = new Set(Object.values(categoryIds));
export const categoryFromId = (id: number) =>
  Object.keys(categoryIds).find((name) => categoryIds[name] === id) || 'Unknown';
