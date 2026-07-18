/**
 * Convert a graph-layout DiagramSpec into absolute primitives via dagre.
 * Labels are measured with Hershey bounds and wrapped so text fits inside nodes.
 */

import { Graph, layout } from "@dagrejs/dagre";
import { stringToPaths as hersheyStringToPaths } from "hershey";
import type {
  DiagramGraphEdge,
  DiagramGraphNode,
  DiagramPrimitive,
  DiagramSpec,
} from "@/lib/whiteboard/diagramSpec";

const NODE_PAD_X = 28;
const NODE_PAD_Y = 20;
const MIN_NODE_W = 88;
const MIN_NODE_H = 44;
const DEFAULT_MARGIN = 48;
const NODE_LABEL_FONT = 14;
const TITLE_FONT = 22;
const HERSHEY_EM = 21;
const MAX_CHARS_PER_LINE = 14;
const LINE_GAP_FACTOR = 0.4;

/** Extra scale so stroke caps / sketchy wobble don't clip the box. */
const MEASURE_SLACK = 1.15;

function measureLineWidth(text: string, fontSize: number): number {
  try {
    const { bounds } = hersheyStringToPaths(text);
    const scale = fontSize / HERSHEY_EM;
    return Math.max(0, (bounds.maxX - bounds.minX) * scale) * MEASURE_SLACK;
  } catch {
    return text.length * fontSize * 0.62 * MEASURE_SLACK;
  }
}

function measureLineHeight(fontSize: number): number {
  return fontSize * 1.15;
}

/** Greedy word-wrap for node labels (keeps boxes readable, not one long line). */
export function wrapDiagramLabel(
  label: string,
  maxCharsPerLine = MAX_CHARS_PER_LINE
): string[] {
  const words = label
    .replace(/\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [label];

  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    // Hard-break very long tokens
    if (word.length > maxCharsPerLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        lines.push(word.slice(i, i + maxCharsPerLine));
      }
      continue;
    }
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function estimateLabelBox(
  label: string,
  shape: DiagramGraphNode["shape"]
): { w: number; h: number; lines: string[] } {
  const lines = wrapDiagramLabel(label);
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, measureLineWidth(line, NODE_LABEL_FONT));
  }
  const lineH = measureLineHeight(NODE_LABEL_FONT);
  const textH =
    lines.length * lineH +
    Math.max(0, lines.length - 1) * NODE_LABEL_FONT * LINE_GAP_FACTOR;

  let w = Math.max(MIN_NODE_W, Math.ceil(maxW + NODE_PAD_X * 2));
  let h = Math.max(MIN_NODE_H, Math.ceil(textH + NODE_PAD_Y * 2));

  // Ellipse / diamond have less usable area near the edges
  if (shape === "ellipse" || shape === "diamond") {
    w = Math.ceil(w * 1.25);
    h = Math.ceil(h * 1.2);
  }

  return { w, h, lines };
}

function nodeShapeOnly(
  node: DiagramGraphNode,
  x: number,
  y: number,
  w: number,
  h: number
): DiagramPrimitive {
  const shape = node.shape ?? "box";
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (shape === "ellipse") {
    return { type: "ellipse", cx, cy, rx: w / 2, ry: h / 2 };
  }
  if (shape === "diamond") {
    return {
      type: "polygon",
      points: [
        { x: cx, y },
        { x: x + w, y: cy },
        { x: cx, y: y + h },
        { x: x, y: cy },
      ],
    };
  }
  return { type: "rect", x, y, w, h };
}

function nodeLabelPrimitives(
  lines: string[],
  x: number,
  y: number,
  w: number,
  h: number
): DiagramPrimitive[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const lineH = measureLineHeight(NODE_LABEL_FONT);
  const gap = NODE_LABEL_FONT * LINE_GAP_FACTOR;
  const blockH =
    lines.length * lineH + Math.max(0, lines.length - 1) * gap;
  // Slight upward optical nudge — Hershey glyphs sit low in their viewBox
  const opticalNudge = NODE_LABEL_FONT * 0.12;
  const top = cy - blockH / 2 + lineH / 2 - opticalNudge;

  return lines.map((text, i) => ({
    type: "label" as const,
    x: cx,
    y: top + i * (lineH + gap),
    text,
    fontSize: NODE_LABEL_FONT,
  }));
}

function edgeEndpointToward(
  fromX: number,
  fromY: number,
  fromW: number,
  fromH: number,
  toX: number,
  toY: number,
  toW: number,
  toH: number,
  fromShape: DiagramGraphNode["shape"]
): { x: number; y: number } {
  const fx = fromX + fromW / 2;
  const fy = fromY + fromH / 2;
  const tx = toX + toW / 2;
  const ty = toY + toH / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 0 && dy === 0) return { x: fx, y: fy };

  const shape = fromShape ?? "box";
  if (shape === "ellipse") {
    const rx = fromW / 2;
    const ry = fromH / 2;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const t =
      (rx * ry) /
      Math.sqrt(ry * ry * ux * ux + rx * rx * uy * uy);
    return { x: fx + ux * t, y: fy + uy * t };
  }

  if (shape === "diamond") {
    const hw = fromW / 2;
    const hh = fromH / 2;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const scale = 1 / (ax / hw + ay / hh || 1);
    return { x: fx + dx * scale, y: fy + dy * scale };
  }

  const hw = fromW / 2;
  const hh = fromH / 2;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: fx + dx * t, y: fy + dy * t };
}

function edgePrimitives(
  edge: DiagramGraphEdge,
  from: {
    x: number;
    y: number;
    w: number;
    h: number;
    shape?: DiagramGraphNode["shape"];
  },
  to: {
    x: number;
    y: number;
    w: number;
    h: number;
    shape?: DiagramGraphNode["shape"];
  },
  points: Array<{ x: number; y: number }> | undefined
): { body: DiagramPrimitive[]; labels: DiagramPrimitive[] } {
  const start = edgeEndpointToward(
    from.x,
    from.y,
    from.w,
    from.h,
    to.x,
    to.y,
    to.w,
    to.h,
    from.shape
  );
  const end = edgeEndpointToward(
    to.x,
    to.y,
    to.w,
    to.h,
    from.x,
    from.y,
    from.w,
    from.h,
    to.shape
  );

  const directed = edge.directed !== false;
  const midPoints =
    points && points.length >= 2 ? points.slice(1, -1) : [];

  const body: DiagramPrimitive[] = [];

  if (midPoints.length === 0) {
    body.push(
      directed
        ? { type: "arrow", x1: start.x, y1: start.y, x2: end.x, y2: end.y }
        : { type: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y }
    );
  } else {
    const poly = [start, ...midPoints, end];
    if (directed) {
      if (poly.length > 2) {
        body.push({ type: "polyline", points: poly.slice(0, -1) });
      }
      const a = poly[poly.length - 2]!;
      const b = poly[poly.length - 1]!;
      body.push({ type: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    } else {
      body.push({ type: "polyline", points: poly });
    }
  }

  const labels: DiagramPrimitive[] = [];
  if (edge.label) {
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2 - 10;
    labels.push({
      type: "label",
      x: mx,
      y: my,
      text: edge.label,
      fontSize: 12,
    });
  }

  return { body, labels };
}

function pickRankdir(
  spec: Extract<DiagramSpec, { layout: "graph" }>
): "TB" | "LR" {
  if (spec.direction === "LR" || spec.direction === "TB") {
    return spec.direction;
  }
  // Heuristic: branching / many siblings → left-right reads better than a tall stack
  const outDegree = new Map<string, number>();
  for (const e of spec.edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
  }
  const hasBranch = [...outDegree.values()].some((d) => d >= 2);
  if (hasBranch && spec.nodes.length >= 4) return "LR";
  // Long chains also benefit from LR so they aren't a single tall column
  if (spec.nodes.length >= 5 && !hasBranch) return "LR";
  return "TB";
}

/**
 * Lay out a graph DiagramSpec into ordered primitives.
 *
 * Natural hand-draw order:
 *   title → (node shape + its labels)… → edges appear once both ends exist
 * so each block is completed before the next, and relationships follow
 * the components they connect (not “all boxes, then all text, then arrows”).
 */
export function layoutGraphToPrimitives(
  spec: Extract<DiagramSpec, { layout: "graph" }>
): DiagramPrimitive[] {
  const rankdir = pickRankdir(spec);
  const g = new Graph({ directed: true, multigraph: true });
  g.setGraph({
    rankdir,
    nodesep: rankdir === "LR" ? 48 : 60,
    ranksep: rankdir === "LR" ? 80 : 64,
    marginx: DEFAULT_MARGIN,
    marginy: DEFAULT_MARGIN,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeMeta = new Map<
    string,
    { node: DiagramGraphNode; w: number; h: number; lines: string[] }
  >();

  for (const node of spec.nodes) {
    const { w, h, lines } = estimateLabelBox(node.label, node.shape);
    nodeMeta.set(node.id, { node, w, h, lines });
    g.setNode(node.id, { width: w, height: h, label: node.label });
  }

  /** Map dagre edge name → original edge (reliable for multigraphs). */
  const edgeByName = new Map<string, DiagramGraphEdge>();
  let edgeIdx = 0;
  for (const edge of spec.edges) {
    if (!nodeMeta.has(edge.from) || !nodeMeta.has(edge.to)) continue;
    const name = `e${edgeIdx++}`;
    edgeByName.set(name, edge);
    g.setEdge(
      edge.from,
      edge.to,
      {
        label: edge.label,
        width: edge.label ? measureLineWidth(edge.label, 12) : 0,
        height: edge.label ? 14 : 0,
        labelpos: "c",
      },
      name
    );
  }

  layout(g);

  const placed = new Map<
    string,
    {
      x: number;
      y: number;
      w: number;
      h: number;
      shape?: DiagramGraphNode["shape"];
      lines: string[];
    }
  >();

  for (const id of g.nodes()) {
    const meta = nodeMeta.get(id);
    const n = g.node(id);
    if (!meta || !n || typeof n.x !== "number" || typeof n.y !== "number") {
      continue;
    }
    placed.set(id, {
      x: n.x - meta.w / 2,
      y: n.y - meta.h / 2,
      w: meta.w,
      h: meta.h,
      shape: meta.node.shape,
      lines: meta.lines,
    });
  }

  type PendingEdge = {
    name: string;
    fromId: string;
    toId: string;
    original: DiagramGraphEdge;
    points: Array<{ x: number; y: number }> | undefined;
  };

  const pendingEdges: PendingEdge[] = [];
  for (const e of g.edges()) {
    const original =
      (e.name ? edgeByName.get(String(e.name)) : undefined) ??
      spec.edges.find((ed) => ed.from === e.v && ed.to === e.w);
    if (!original) continue;
    if (!placed.has(e.v) || !placed.has(e.w)) continue;
    const edgeLabel = g.edge(e) as
      | { points?: Array<{ x: number; y: number }> }
      | undefined;
    pendingEdges.push({
      name: e.name ? String(e.name) : `${e.v}->${e.w}`,
      fromId: e.v,
      toId: e.w,
      original,
      points: edgeLabel?.points,
    });
  }

  // Reading order: top-to-bottom, then left-to-right
  const nodeOrder = [...placed.keys()].sort((a, b) => {
    const pa = placed.get(a)!;
    const pb = placed.get(b)!;
    const dy = pa.y - pb.y;
    if (Math.abs(dy) > 24) return dy;
    return pa.x - pb.x;
  });

  const out: DiagramPrimitive[] = [];

  if (spec.title) {
    out.push({
      type: "label",
      x: DEFAULT_MARGIN,
      y: 18,
      text: spec.title,
      fontSize: TITLE_FONT,
    });
  }

  const drawn = new Set<string>();
  const emittedEdges = new Set<string>();

  const flushReadyEdges = () => {
    for (const pe of pendingEdges) {
      if (emittedEdges.has(pe.name)) continue;
      if (!drawn.has(pe.fromId) || !drawn.has(pe.toId)) continue;
      const from = placed.get(pe.fromId);
      const to = placed.get(pe.toId);
      if (!from || !to) continue;
      const { body, labels } = edgePrimitives(
        pe.original,
        from,
        to,
        pe.points
      );
      out.push(...body, ...labels);
      emittedEdges.add(pe.name);
    }
  };

  for (const id of nodeOrder) {
    const meta = nodeMeta.get(id);
    const pos = placed.get(id);
    if (!meta || !pos) continue;
    // Component block: shape, then its text
    out.push(nodeShapeOnly(meta.node, pos.x, pos.y, pos.w, pos.h));
    out.push(...nodeLabelPrimitives(pos.lines, pos.x, pos.y, pos.w, pos.h));
    drawn.add(id);
    // Relationships whose both ends are now on the board
    flushReadyEdges();
  }

  // Any remaining edges (e.g. if an endpoint was missing from layout)
  flushReadyEdges();

  return out;
}

/** Resolve any DiagramSpec to an absolute primitive list. */
export function resolveDiagramPrimitives(
  spec: DiagramSpec
): DiagramPrimitive[] {
  if (spec.layout === "absolute") {
    const prims = [...spec.primitives];
    if (spec.title) {
      prims.unshift({
        type: "label",
        x: 20,
        y: 16,
        text: spec.title,
        fontSize: TITLE_FONT,
      });
    }
    return prims;
  }
  return layoutGraphToPrimitives(spec);
}
