import type { Node, Edge, XYPosition, Viewport } from '@xyflow/react';
export type PortKind = 'power' | 'industrial';
export interface Port {
  id: string;
  name: string;
  kind: PortKind;
  direction: 'in' | 'out';
}
export type Behavior =
  | 'source'
  | 'battery'
  | 'branch'
  | 'splitter'
  | 'combiner'
  | 'switch'
  | 'and'
  | 'or'
  | 'xor'
  | 'blocker'
  | 'memory'
  | 'timer'
  | 'sensor'
  | 'consumer'
  | 'conveyor'
  | 'storage'
  | 'industrialSplitter'
  | 'industrialCombiner'
  | 'furnace'
  | 'crafter';
export interface ComponentDefinition {
  id: string;
  name: string;
  shortname: string;
  category: 'El' | 'Logik' | 'Sensorer' | 'Industrial' | 'Förvaring' | 'Förbrukare';
  behavior: Behavior;
  ports: Port[];
  watts: number;
  source: string;
  verification: 'documented' | 'modelled';
  note?: string;
}
export interface Item {
  id: string;
  name: string;
  category: string;
  categoryId: number;
  stack: number;
  image: string;
  recipe?: { output: number; seconds: number; ingredients: { item: string; amount: number }[] };
}
export interface FilterRule {
  item: string | null;
  category: number | null;
  min: number;
  max: number;
  buffer: number;
  blueprint: boolean;
}
export interface ConveyorFilter {
  name: string;
  mode: 'any' | 'all' | 'exclude';
  rules: FilterRule[];
}
export interface Stack {
  item: string;
  amount: number;
}
export interface ComponentSettings {
  enabled: boolean;
  branch: number;
  seconds: number;
  sensor: boolean;
  slots: number;
  inventory: Stack[];
  filter: ConveyorFilter;
  recipe: string;
  workbench: number;
}
export type ComponentNode = Node<{ definition: string; settings: ComponentSettings }, 'component'>;
export type WireEdge = Edge<{ color: string; kind: PortKind; waypoints: XYPosition[] }, 'wire'>;
export interface Circuit {
  schemaVersion: 1;
  id: string;
  name: string;
  nodes: ComponentNode[];
  edges: WireEdge[];
  viewport: Viewport;
}
export interface SavedRecord {
  id: string;
  kind: 'circuit' | 'filter';
  name: string;
  updatedAt: number;
  payload: Circuit | ConveyorFilter;
}
export interface SimulationResult {
  time: number;
  nodeStates: Record<
    string,
    { input: number; active: boolean; message: string; inventory: Stack[] }
  >;
  outputs: Record<string, number>;
  warnings: string[];
  transfers: number;
  memory: Record<
    string,
    {
      set: boolean;
      until: number;
      lastToggle: boolean;
      lastTrigger: boolean;
      progress: number;
      productionItem?: string;
      pass: boolean;
      buffers?: Record<string, number>;
    }
  >;
}
export interface SimulationRequest {
  type: 'step' | 'reset';
  circuit: Circuit;
  dt: number;
  requestId: number;
}
export interface SimulationResponse {
  type: 'result';
  requestId: number;
  result: SimulationResult;
}
export const emptyFilter = (): ConveyorFilter => ({ name: 'Nytt filter', mode: 'any', rules: [] });
export const defaultSettings = (): ComponentSettings => ({
  enabled: true,
  branch: 2,
  seconds: 5,
  sensor: false,
  slots: 48,
  inventory: [],
  filter: emptyFilter(),
  recipe: 'gunpowder',
  workbench: 3,
});
export const blankCircuit = (): Circuit => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  name: 'Ny krets',
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});
