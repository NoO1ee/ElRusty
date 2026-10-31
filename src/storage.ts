import Dexie, { type EntityTable } from 'dexie';
import type { SavedRecord, Circuit, ConveyorFilter } from './model';
import { byDefinition } from './data/catalog';
import { byItem, recipes } from './data/items';
import { validateRules } from './filters';
import { inventoryProblem, stackSize } from './simulation/inventory';
import { validateConnection } from './graph';
export class RustyDatabase extends Dexie {
  records!: EntityTable<SavedRecord, 'id'>;
  preferences!: EntityTable<{ key: string; value: unknown }, 'key'>;
  constructor(name = 'elrusty') {
    super(name);
    this.version(1).stores({ records: 'id, kind, updatedAt, name', preferences: 'key' });
  }
}
export const db = new RustyDatabase();
export async function saveRecord(record: SavedRecord) {
  await db.records.put(structuredClone(record));
}
export const listRecords = () => db.records.orderBy('updatedAt').reverse().toArray();
function fail(message: string): never {
  throw new Error(message);
}
export function validateFilter(value: unknown): asserts value is ConveyorFilter {
  const f = value as ConveyorFilter;
  if (
    !f ||
    typeof f.name !== 'string' ||
    f.name.length > 200 ||
    !['any', 'all', 'exclude'].includes(f.mode)
  )
    fail('Ogiltigt filter.');
  validateRules(f.rules);
  for (const r of f.rules)
    if (r.item !== null && !byItem[r.item]) fail('Okänt item i filtret: ' + r.item);
}
export function validateCircuit(value: unknown): asserts value is Circuit {
  const c = value as Circuit;
  if (
    !c ||
    c.schemaVersion !== 1 ||
    typeof c.id !== 'string' ||
    typeof c.name !== 'string' ||
    c.name.length > 200 ||
    !Array.isArray(c.nodes) ||
    !Array.isArray(c.edges) ||
    c.nodes.length > 500 ||
    c.edges.length > 2000
  )
    fail('Ogiltig krets eller formatversion.');
  const nodeIds = new Set();
  for (const n of c.nodes) {
    if (
      typeof n.id !== 'string' ||
      nodeIds.has(n.id) ||
      n.type !== 'component' ||
      !byDefinition[n.data?.definition] ||
      !Number.isFinite(n.position?.x) ||
      !Number.isFinite(n.position?.y)
    )
      fail('Ogiltig komponent.');
    nodeIds.add(n.id);
    const s = n.data.settings;
    if (
      !s ||
      typeof s.enabled !== 'boolean' ||
      typeof s.sensor !== 'boolean' ||
      !Number.isSafeInteger(s.branch) ||
      s.branch < 2 ||
      s.branch > 10000 ||
      !Number.isFinite(s.seconds) ||
      s.seconds < 0.1 ||
      s.seconds > 86400 ||
      !Number.isInteger(s.slots) ||
      s.slots < 1 ||
      s.slots > 96 ||
      !Array.isArray(s.inventory) ||
      s.inventory.length > 96
    )
      fail('Ogiltiga komponentinställningar.');
    for (const stack of s.inventory)
      if (
        !byItem[stack.item] ||
        !Number.isSafeInteger(stack.amount) ||
        stack.amount < 1 ||
        stack.amount > 1000000 ||
        (stack.blueprint !== undefined && typeof stack.blueprint !== 'boolean') ||
        (stack.slot !== undefined &&
          (!Number.isInteger(stack.slot) || stack.slot < 0 || stack.slot > 95))
      )
        fail('Ogiltigt lager.');
    const used = s.inventory.reduce(
      (sum, stack) => sum + Math.ceil(stack.amount / stackSize(stack)),
      0,
    );
    if (used > s.slots) fail('Lagret överskrider antalet platser.');
    if (
      byDefinition[n.data.definition].behavior === 'crafter' &&
      (!Object.hasOwn(recipes, s.recipe) || ![1, 2, 3].includes(s.workbench))
    )
      fail('Ogiltigt recept eller workbench.');
    if (
      s.blueprints !== undefined &&
      (!Array.isArray(s.blueprints) ||
        s.blueprints.length > 4 ||
        s.blueprints.some(
          (id) => typeof id !== 'string' || (id !== '' && !Object.hasOwn(byItem, id)),
        ))
    )
      fail('Ogiltigt blueprint-lager.');
    if (s.inventory.some((i) => i.slot !== undefined) && inventoryProblem(n, s.inventory))
      fail(inventoryProblem(n, s.inventory));
    validateFilter(s.filter);
  }
  const edgeIds = new Set();
  const accepted: Circuit['edges'] = [];
  for (const e of c.edges) {
    if (
      typeof e.id !== 'string' ||
      edgeIds.has(e.id) ||
      e.type !== 'wire' ||
      !e.sourceHandle ||
      !e.targetHandle
    )
      fail('Ogiltig kabel.');
    const reason = validateConnection(
      { nodes: c.nodes, edges: accepted },
      e.source,
      e.target,
      e.sourceHandle,
      e.targetHandle,
    );
    if (reason) fail(reason);
    if (
      !e.data ||
      !/^#[0-9a-fA-F]{6}$/.test(e.data.color) ||
      !['power', 'industrial'].includes(e.data.kind) ||
      !Array.isArray(e.data.waypoints) ||
      e.data.waypoints.length > 100 ||
      e.data.waypoints.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      fail('Ogiltiga kabelinställningar.');
    const port = byDefinition[c.nodes.find((n) => n.id === e.source)!.data.definition].ports.find(
      (p) => p.id === e.sourceHandle,
    )!;
    if (port.kind !== e.data.kind) fail('Kabelns typ matchar inte porten.');
    edgeIds.add(e.id);
    accepted.push(e);
  }
  if (
    !c.viewport ||
    ![c.viewport.x, c.viewport.y, c.viewport.zoom].every(Number.isFinite) ||
    c.viewport.zoom < 0.1 ||
    c.viewport.zoom > 4
  )
    fail('Ogiltig arbetsyta.');
}
/** Only migrate the known erroneous furnace output. Other invalid data is still rejected. */
export function loadCircuit(value: unknown): { circuit: Circuit; notice?: string } {
  const c = structuredClone(value) as Circuit;
  let removed = 0;
  if (Array.isArray(c?.nodes) && Array.isArray(c?.edges)) {
    const furnaces = new Set(
      c.nodes.filter((n) => n?.data?.definition === 'furnace').map((n) => n.id),
    );
    c.edges = c.edges.filter((e) => {
      if (furnaces.has(e?.source) && e.sourceHandle === 'out:Passthrough') {
        removed++;
        return false;
      }
      return true;
    });
  }
  validateCircuit(c);
  return {
    circuit: c,
    ...(removed
      ? {
          notice:
            removed +
            ' ogiltiga anslutningar från ugnens gamla Passthrough-port togs bort. Koppla om via en Splitter eller Branch.',
        }
      : {}),
  };
}
export function encodeBackup(kind: 'circuit' | 'filter', payload: Circuit | ConveyorFilter) {
  return JSON.stringify({ application: 'ElRusty', schemaVersion: 1, kind, payload }, null, 2);
}
export function decodeBackup(text: string): SavedRecord {
  if (text.length > 5_000_000) fail('Filen är för stor.');
  const parsed = JSON.parse(text);
  if (parsed.application !== 'ElRusty' || parsed.schemaVersion !== 1)
    fail('Filen är inte en stödd ElRusty-backup.');
  let migrationNotice: string | undefined;
  if (parsed.kind === 'circuit') {
    const loaded = loadCircuit(parsed.payload);
    parsed.payload = loaded.circuit;
    migrationNotice = loaded.notice;
  } else if (parsed.kind === 'filter') validateFilter(parsed.payload);
  else fail('Okänd backuptyp.');
  const id = crypto.randomUUID();
  const payload = parsed.payload;
  if (parsed.kind === 'circuit') payload.id = id;
  return {
    id,
    kind: parsed.kind,
    name: payload.name,
    updatedAt: Date.now(),
    payload,
    ...(migrationNotice ? { migrationNotice } : {}),
  };
}
export function downloadJson(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^\p{L}\p{N} _-]/gu, '') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
