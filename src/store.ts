import { create } from 'zustand';
import type {
  Circuit,
  ComponentNode,
  WireEdge,
  ComponentSettings,
  SimulationResult,
} from './model';
import { starterCircuit, newNode } from './data/catalog';
import { removeSelection, validateConnection } from './graph';
import { initialResult } from './simulation/engine';
import { freePlacement } from './placement';
type GraphSnapshot = Pick<Circuit, 'nodes' | 'edges'>;
const snapshot = (c: Circuit): GraphSnapshot => structuredClone({ nodes: c.nodes, edges: c.edges });
interface Store {
  circuit: Circuit;
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  running: boolean;
  simulation: SimulationResult;
  message: string;
  saveStatus: string;
  left: boolean;
  right: boolean;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setGraph: (nodes: ComponentNode[], edges?: WireEdge[]) => void;
  replace: (c: Circuit) => void;
  rename: (name: string) => void;
  add: (definition: string, x: number, y: number) => void;
  settings: (id: string, patch: Partial<ComponentSettings>) => void;
  connect: (source: string, target: string, sourceHandle: string, targetHandle: string) => boolean;
  patchEdge: (id: string, patch: Partial<NonNullable<WireEdge['data']>>, commit?: boolean) => void;
  deleteSelected: () => void;
  notify: (message: string) => void;
}
export const useStudio = create<Store>((set, get) => ({
  circuit: starterCircuit(),
  past: [],
  future: [],
  running: false,
  simulation: initialResult(),
  message: 'Dra in komponenter och anslut deras portar.',
  saveStatus: 'Läser lokalt bibliotek…',
  left: true,
  right: true,
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-79), snapshot(s.circuit)], future: [] })),
  undo: () => {
    const s = get(),
      prev = s.past.at(-1);
    if (prev)
      set({
        circuit: { ...s.circuit, ...structuredClone(prev) },
        past: s.past.slice(0, -1),
        future: [snapshot(s.circuit), ...s.future],
      });
  },
  redo: () => {
    const s = get(),
      next = s.future[0];
    if (next)
      set({
        circuit: { ...s.circuit, ...structuredClone(next) },
        past: [...s.past, snapshot(s.circuit)],
        future: s.future.slice(1),
      });
  },
  setGraph: (nodes, edges) =>
    set((s) => ({ circuit: { ...s.circuit, nodes, edges: edges ?? s.circuit.edges } })),
  replace: (circuit) =>
    set({
      circuit: structuredClone(circuit),
      past: [],
      future: [],
      running: false,
      simulation: initialResult(),
    }),
  rename: (name) => set((s) => ({ circuit: { ...s.circuit, name: name.slice(0, 200) } })),
  add: (definition, x, y) => {
    get().checkpoint();
    const position = freePlacement(get().circuit.nodes, definition, x, y);
    set((s) => ({
      circuit: {
        ...s.circuit,
        nodes: [
          ...s.circuit.nodes.map((n) => ({ ...n, selected: false })),
          { ...newNode(definition, position.x, position.y), selected: true },
        ],
      },
    }));
  },
  settings: (id, patch) => {
    get().checkpoint();
    set((s) => ({
      circuit: {
        ...s.circuit,
        nodes: s.circuit.nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, settings: { ...n.data.settings, ...patch } } }
            : n,
        ),
      },
    }));
  },
  connect: (source, target, sourceHandle, targetHandle) => {
    const reason = validateConnection(get().circuit, source, target, sourceHandle, targetHandle);
    if (reason) {
      get().notify(reason);
      return false;
    }
    get().checkpoint();
    const kind =
      sourceHandle.includes('Industrial') || sourceHandle.includes('Blueprint')
        ? 'industrial'
        : 'power';
    set((s) => ({
      circuit: {
        ...s.circuit,
        edges: [
          ...s.circuit.edges,
          {
            id: crypto.randomUUID(),
            type: 'wire',
            source,
            target,
            sourceHandle,
            targetHandle,
            data: { color: kind === 'power' ? '#ff4d59' : '#73d9b0', kind, waypoints: [] },
          },
        ],
      },
    }));
    return true;
  },
  patchEdge: (id, patch, commit = true) => {
    if (commit) get().checkpoint();
    set((s) => ({
      circuit: {
        ...s.circuit,
        edges: s.circuit.edges.map((e) =>
          e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e,
        ),
      },
    }));
  },
  deleteSelected: () => {
    const s = get();
    if (!s.circuit.nodes.some((n) => n.selected) && !s.circuit.edges.some((e) => e.selected))
      return;
    s.checkpoint();
    const graph = removeSelection(s.circuit.nodes, s.circuit.edges);
    set({ circuit: { ...s.circuit, ...graph } });
  },
  notify: (message) => set({ message }),
}));
