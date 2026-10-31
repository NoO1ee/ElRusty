import type { XYPosition } from '@xyflow/react';
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const same = (a: XYPosition, b: XYPosition) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
export function pointInside(p: XYPosition, r: Rect) {
  return (
    p.x > r.x + 0.01 &&
    p.x < r.x + r.width - 0.01 &&
    p.y > r.y + 0.01 &&
    p.y < r.y + r.height - 0.01
  );
}
export function segmentBlocked(a: XYPosition, b: XYPosition, rects: Rect[]) {
  if (Math.abs(a.x - b.x) < 0.01)
    return rects.some(
      (r) =>
        a.x > r.x + 0.01 &&
        a.x < r.x + r.width - 0.01 &&
        Math.max(a.y, b.y) > r.y + 0.01 &&
        Math.min(a.y, b.y) < r.y + r.height - 0.01,
    );
  if (Math.abs(a.y - b.y) < 0.01)
    return rects.some(
      (r) =>
        a.y > r.y + 0.01 &&
        a.y < r.y + r.height - 0.01 &&
        Math.max(a.x, b.x) > r.x + 0.01 &&
        Math.min(a.x, b.x) < r.x + r.width - 0.01,
    );
  return true;
}
export function simplify(points: XYPosition[]) {
  const out: XYPosition[] = [];
  for (const p of points) {
    if (out.length && same(out.at(-1)!, p)) continue;
    while (out.length > 1) {
      const a = out.at(-2)!,
        b = out.at(-1)!;
      if (
        (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01)
      )
        out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}
function routeLeg(start: XYPosition, end: XYPosition, rects: Rect[]): XYPosition[] | null {
  if (same(start, end)) return [start];
  const bends = [
    { x: end.x, y: start.y },
    { x: start.x, y: end.y },
  ];
  for (const b of bends)
    if (!segmentBlocked(start, b, rects) && !segmentBlocked(b, end, rects))
      return simplify([start, b, end]);
  const xs = [...new Set([start.x, end.x, ...rects.flatMap((r) => [r.x, r.x + r.width])])].sort(
      (a, b) => a - b,
    ),
    ys = [...new Set([start.y, end.y, ...rects.flatMap((r) => [r.y, r.y + r.height])])].sort(
      (a, b) => a - b,
    );
  const width = xs.length,
    total = width * ys.length;
  if (total > 50000) return null;
  const idx = (p: XYPosition) => ys.indexOf(p.y) * width + xs.indexOf(p.x),
    s = idx(start),
    t = idx(end),
    cost = new Float64Array(total).fill(Infinity),
    prev = new Int32Array(total).fill(-1),
    closed = new Uint8Array(total),
    valid = new Int8Array(total).fill(-1);
  const pos = (i: number) => ({ x: xs[i % width], y: ys[Math.floor(i / width)] });
  const allowed = (i: number) => {
    if (valid[i] === -1) valid[i] = rects.some((r) => pointInside(pos(i), r)) ? 0 : 1;
    return valid[i] === 1;
  };
  const heap: { id: number; score: number }[] = [];
  function push(id: number, score: number) {
    heap.push({ id, score });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].score <= score) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }
  function pop() {
    const item = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let j = i * 2 + 1;
        if (j >= heap.length) break;
        if (j + 1 < heap.length && heap[j + 1].score < heap[j].score) j++;
        if (heap[i].score <= heap[j].score) break;
        [heap[i], heap[j]] = [heap[j], heap[i]];
        i = j;
      }
    }
    return item;
  }
  cost[s] = 0;
  push(s, 0);
  while (heap.length) {
    const { id } = pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === t) {
      const path = [];
      let i = t;
      while (i !== -1) {
        path.push(pos(i));
        i = prev[i];
      }
      return simplify(path.reverse());
    }
    const x = id % width,
      y = Math.floor(id / width),
      a = pos(id);
    for (const n of [
      x > 0 ? id - 1 : -1,
      x < width - 1 ? id + 1 : -1,
      y > 0 ? id - width : -1,
      y < ys.length - 1 ? id + width : -1,
    ]) {
      if (n < 0 || closed[n] || !allowed(n)) continue;
      const b = pos(n);
      if (segmentBlocked(a, b, rects)) continue;
      const nc = cost[id] + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + 0.01;
      if (nc < cost[n]) {
        cost[n] = nc;
        prev[n] = id;
        push(n, nc + Math.abs(b.x - end.x) + Math.abs(b.y - end.y));
      }
    }
  }
  return null;
}
export function routeWire(
  start: XYPosition,
  end: XYPosition,
  obstacles: Rect[],
  waypoints: XYPosition[] = [],
) {
  const rects = obstacles.map((r) => ({
      x: r.x - 14,
      y: r.y - 14,
      width: r.width + 28,
      height: r.height + 28,
    })),
    stubA = { x: start.x + 26, y: start.y },
    stubB = { x: end.x - 26, y: end.y };
  const anchors = [stubA, ...waypoints, stubB];
  let conflict = waypoints.some((p) => rects.some((r) => pointInside(p, r))),
    points: XYPosition[] = [start, stubA];
  for (let i = 1; i < anchors.length; i++) {
    const leg = routeLeg(anchors[i - 1], anchors[i], rects);
    if (!leg) {
      conflict = true;
      points.push({ x: anchors[i].x, y: anchors[i - 1].y }, anchors[i]);
    } else points.push(...leg.slice(1));
  }
  points.push(end);
  return { points: simplify(points), conflict };
}
export const pathFromPoints = (p: XYPosition[]) =>
  p.map((v, i) => (i ? 'L' : 'M') + v.x + ',' + v.y).join(' ');
