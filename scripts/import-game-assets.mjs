import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const gamePath = process.argv[2];
if (!gamePath) throw new Error('Ange sökvägen till Rust/Bundles/items.');
const categoryIds = {
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
await fs.mkdir('public/items', { recursive: true });
await fs.mkdir('src/data', { recursive: true });
const data = [];
for (const file of (await fs.readdir(gamePath)).filter((f) => f.endsWith('.json')).sort()) {
  const item = JSON.parse(await fs.readFile(path.join(gamePath, file), 'utf8'));
  if (!item.shortname || !item.Name) continue;
  const image = '/items/' + item.shortname + '.webp';
  try {
    await sharp(path.join(gamePath, file.replace(/\.json$/, '.png')))
      .resize(128, 128, { fit: 'inside' })
      .webp({ quality: 78 })
      .toFile('public' + image);
  } catch {
    continue;
  }
  data.push({
    id: item.shortname,
    name: item.Name,
    category: item.Category,
    categoryId: categoryIds[item.Category],
    stack: Math.max(1, item.stackable || 1),
    image,
  });
}
await fs.writeFile('src/data/items.json', JSON.stringify(data, null, 2) + '\n');
await fs.writeFile(
  'src/data/provenance.json',
  JSON.stringify(
    {
      source: 'Rust game installation: Bundles/items',
      generatedAt: new Date().toISOString(),
      count: data.length,
      images: 'Facepunch Studios game assets; not MIT licensed',
    },
    null,
    2,
  ) + '\n',
);
console.log('Importerade', data.length, 'items med lokala bilder.');
