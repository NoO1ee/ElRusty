import type { Circuit, ComponentNode, LessonArea, LogicComponent } from '../../model';
import { blankCircuit } from '../../model';
import { newNode, nodeHeight, byDefinition, NODE_WIDTH } from '../catalog';

export function lessonBuilder(component: LogicComponent) {
  const circuit = blankCircuit();
  circuit.lesson = { component, areas: [] };
  function section(title: string, description: string, why: string, exercise: string) {
    const index = circuit.lesson!.areas.length,
      y = index * 1240;
    const area: LessonArea = {
      id: component + '-' + index,
      title,
      description,
      why,
      exercise,
      x: 0,
      y,
      width: 700,
      height: 400,
      controls: [],
      focusNodeId: '',
      outputNodeId: '',
    };
    circuit.lesson!.areas.push(area);
    function node(definition: string, label: string, col: number, row: number) {
      const n = newNode(definition, 60 + col * 320, y + 145 + row * 220);
      n.id = area.id + '-n' + circuit.nodes.length;
      n.data.label = title + ' · ' + label;
      circuit.nodes.push(n);
      area.width = Math.max(area.width, n.position.x + NODE_WIDTH + 60 - area.x);
      area.height = Math.max(
        area.height,
        n.position.y + nodeHeight(byDefinition[definition]) + 60 - area.y,
      );
      return n;
    }
    function input(label: string, col: number, row: number, enabled = false, watts: 20 | 40 = 20) {
      const n = node(watts === 40 ? 'generator' : 'solar', label, col, row);
      n.data.settings.enabled = enabled;
      area.controls.push({ nodeId: n.id, label });
      return n;
    }
    function supply(col = 2, row = 0) {
      return node('generator', 'Fast matning · 40 rW', col, row);
    }
    function gate(definition: LogicComponent, col: number, row: number) {
      const n = node(definition, definition.toUpperCase(), col, row);
      if (definition === component) area.focusNodeId = n.id;
      return n;
    }
    function lamp(col: number, row: number, label = 'Resultat') {
      const n = node('simple-light', label, col, row);
      if (!area.outputNodeId) area.outputNodeId = n.id;
      return n;
    }
    function wire(
      a: ComponentNode,
      b: ComponentNode,
      source = 'Power Out',
      target = 'Power In',
      color = '#65b4ff',
    ) {
      circuit.edges.push({
        id: area.id + '-w' + circuit.edges.length,
        type: 'wire',
        source: a.id,
        target: b.id,
        sourceHandle: 'out:' + source,
        targetHandle: 'in:' + target,
        data: { color, kind: 'power', waypoints: [] },
      });
    }
    function binary(a: ComponentNode, b: ComponentNode, g: ComponentNode) {
      wire(a, g, 'Power Out', 'Input A');
      wire(b, g, 'Power Out', 'Input B', '#bd9aff');
    }
    return { area, node, input, supply, gate, lamp, wire, binary };
  }
  return { circuit, section };
}
export interface LessonDefinition {
  component: LogicComponent;
  title: string;
  explanation: string;
  why: string;
  formula: string;
  source: string;
  rows: { a: string; b: string; out: string }[];
  create: () => Circuit;
}
export const binaryRows = (values: number[]) =>
  values.map((out, i) => ({ a: String(i >> 1), b: String(i & 1), out: String(out) }));
