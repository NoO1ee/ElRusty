import type { Circuit, ComponentNode, WireEdge } from './model';
import { byDefinition } from './data/catalog';
export function validateConnection(
  circuit: Pick<Circuit, 'nodes' | 'edges'>,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  ignoreEdge?: string,
): string | null {
  const a = circuit.nodes.find((n) => n.id === source),
    b = circuit.nodes.find((n) => n.id === target);
  if (!a || !b) return 'Komponenten saknas.';
  if (source === target) return 'Anslut till en annan komponent.';
  const out = byDefinition[a.data.definition]?.ports.find(
      (p) => p.id === sourceHandle && p.direction === 'out',
    ),
    input = byDefinition[b.data.definition]?.ports.find(
      (p) => p.id === targetHandle && p.direction === 'in',
    );
  if (!out || !input) return 'Välj output → input.';
  if (out.kind !== input.kind) return 'El och industrial måste anslutas till samma porttyp.';
  if (
    circuit.edges.some(
      (e) =>
        e.id !== ignoreEdge &&
        ((e.source === source && e.sourceHandle === sourceHandle) ||
          (e.target === target && e.targetHandle === targetHandle)),
    )
  )
    return 'Porten används redan. Koppla loss kabeln först.';
  if (
    b.data.definition === 'root' &&
    !['source', 'battery', 'combiner'].includes(byDefinition[a.data.definition].behavior)
  )
    return 'Root Combiner kräver en energikälla eller en annan Root Combiner.';
  return null;
}
export function removeSelection(nodes: ComponentNode[], edges: WireEdge[]) {
  const removed = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  return {
    nodes: nodes.filter((n) => !n.selected),
    edges: edges.filter((e) => !e.selected && !removed.has(e.source) && !removed.has(e.target)),
  };
}
