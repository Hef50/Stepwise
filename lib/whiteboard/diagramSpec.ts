/**
 * Structured diagram DSL emitted by the AI (tool call or [[diagram: …]] marker).
 * Hybrid: graph mode (dagre auto-layout) or absolute primitives (geometry/plots).
 */

import { z } from "zod";

// ─── Shared primitives (compile target for both layouts) ──────────────────────

export const diagramPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type DiagramPoint = z.infer<typeof diagramPointSchema>;

export const diagramNodeShapeSchema = z.enum(["box", "ellipse", "diamond"]);
export type DiagramNodeShape = z.infer<typeof diagramNodeShapeSchema>;

const linePrimitiveSchema = z.object({
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  color: z.string().optional(),
});

const arrowPrimitiveSchema = z.object({
  type: z.literal("arrow"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  color: z.string().optional(),
});

const rectPrimitiveSchema = z.object({
  type: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  color: z.string().optional(),
  fill: z.string().optional(),
});

const circlePrimitiveSchema = z.object({
  type: z.literal("circle"),
  cx: z.number(),
  cy: z.number(),
  r: z.number().positive(),
  color: z.string().optional(),
  fill: z.string().optional(),
});

const ellipsePrimitiveSchema = z.object({
  type: z.literal("ellipse"),
  cx: z.number(),
  cy: z.number(),
  rx: z.number().positive(),
  ry: z.number().positive(),
  color: z.string().optional(),
  fill: z.string().optional(),
});

const polylinePrimitiveSchema = z.object({
  type: z.literal("polyline"),
  points: z.array(diagramPointSchema).min(2),
  color: z.string().optional(),
});

const polygonPrimitiveSchema = z.object({
  type: z.literal("polygon"),
  points: z.array(diagramPointSchema).min(3),
  color: z.string().optional(),
  fill: z.string().optional(),
});

const labelPrimitiveSchema = z.object({
  type: z.literal("label"),
  x: z.number(),
  y: z.number(),
  text: z.string().min(1).max(80),
  color: z.string().optional(),
  fontSize: z.number().positive().optional(),
});

export const diagramPrimitiveSchema = z.discriminatedUnion("type", [
  linePrimitiveSchema,
  arrowPrimitiveSchema,
  rectPrimitiveSchema,
  circlePrimitiveSchema,
  ellipsePrimitiveSchema,
  polylinePrimitiveSchema,
  polygonPrimitiveSchema,
  labelPrimitiveSchema,
]);

export type DiagramPrimitive = z.infer<typeof diagramPrimitiveSchema>;

// ─── Graph layout (nodes + edges → client dagre → primitives) ─────────────────

export const diagramGraphNodeSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(60),
  shape: diagramNodeShapeSchema.optional(),
});

export type DiagramGraphNode = z.infer<typeof diagramGraphNodeSchema>;

export const diagramGraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(40).optional(),
  directed: z.boolean().optional(),
});

export type DiagramGraphEdge = z.infer<typeof diagramGraphEdgeSchema>;

const graphSpecSchema = z.object({
  layout: z.literal("graph"),
  title: z.string().max(80).optional(),
  /** Preferred flow direction. Omit to let the client pick (branching → LR). */
  direction: z.enum(["TB", "LR"]).optional(),
  width: z.number().positive().max(2000).optional(),
  height: z.number().positive().max(2000).optional(),
  nodes: z.array(diagramGraphNodeSchema).min(1).max(40),
  edges: z.array(diagramGraphEdgeSchema).max(80).default([]),
});

const absoluteSpecSchema = z.object({
  layout: z.literal("absolute"),
  title: z.string().max(80).optional(),
  width: z.number().positive().max(2000).optional(),
  height: z.number().positive().max(2000).optional(),
  primitives: z.array(diagramPrimitiveSchema).min(1).max(120),
});

export const diagramSpecSchema = z.discriminatedUnion("layout", [
  graphSpecSchema,
  absoluteSpecSchema,
]);

export type DiagramSpec = z.infer<typeof diagramSpecSchema>;

/** Parse + validate unknown JSON into a DiagramSpec. Returns null on failure. */
export function parseDiagramSpec(raw: unknown): DiagramSpec | null {
  const result = diagramSpecSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data;
}

/** Stable fingerprint for deduping identical diagrams on the board. */
export function diagramSpecKey(spec: DiagramSpec): string {
  return JSON.stringify(spec);
}
