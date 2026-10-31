import type { Circuit } from '../model';
import { byDefinition } from '../data/catalog';
/** Temporary teaching controls never rewrite the circuit's saved settings. */
export function withTestInputs(circuit: Circuit, inputs: Record<string, boolean> = {}): Circuit {
  const allowed = new Set(
    circuit.lesson?.areas.flatMap((a) => a.controls.map((c) => c.nodeId)) ?? [],
  );
  return {
    ...circuit,
    nodes: circuit.nodes.map((n) =>
      allowed.has(n.id) &&
      byDefinition[n.data.definition].behavior === 'source' &&
      typeof inputs[n.id] === 'boolean'
        ? { ...n, data: { ...n.data, settings: { ...n.data.settings, enabled: inputs[n.id] } } }
        : n,
    ),
  };
}
