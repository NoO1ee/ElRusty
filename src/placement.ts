import type { ComponentNode } from './model';
import { byDefinition, NODE_WIDTH, nodeHeight } from './data/catalog';
export function freePlacement(nodes: ComponentNode[], definition: string, x: number, y: number) {
  const h = nodeHeight(byDefinition[definition]);
  const candidates = [{ x, y }];
  for (let ring = 1; ring <= 25; ring++) {
    candidates.push(
      { x: x + ring * (NODE_WIDTH + 40), y },
      { x, y: y + ring * (h + 40) },
      { x: x - ring * (NODE_WIDTH + 40), y },
      { x, y: y - ring * (h + 40) },
    );
  }
  return (
    candidates.find(
      (p) =>
        !nodes.some(
          (n) =>
            p.x < n.position.x + NODE_WIDTH + 20 &&
            p.x + NODE_WIDTH + 20 > n.position.x &&
            p.y < n.position.y + nodeHeight(byDefinition[n.data.definition]) + 20 &&
            p.y + h + 20 > n.position.y,
        ),
    ) ?? { x, y: y + 5000 }
  );
}
