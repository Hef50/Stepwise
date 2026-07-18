/**
 * Compile diagram primitives into ordered SVG paths for stroke-by-stroke animation.
 * Supports clean (precise) and sketchy (rough.js) styles; labels reuse textToSvgPaths.
 */

import rough from "roughjs/bin/rough";
import type { Drawable, Options as RoughOptions } from "roughjs/bin/core";
import type { DiagramPathData, DiagramStyle } from "@/lib/types";
import type { DiagramPrimitive } from "@/lib/whiteboard/diagramSpec";
import { textToSvgPaths } from "@/lib/whiteboard/textToSvgPaths";
import type { WhiteboardTextMode } from "@/lib/whiteboard/textStyle";

export const MAX_ANIMATED_DIAGRAM_PATHS = 400;

const DEFAULT_STROKE_WIDTH = 2;
const ARROW_HEAD_LEN = 12;
const ARROW_HEAD_ANGLE = Math.PI / 7;
const LABEL_FONT_SIZE = 16;
const BOUNDS_PAD = 16;

export interface ParsedDiagramPaths {
  paths: DiagramPathData[];
  viewBox: string;
}

export interface DiagramCompileOptions {
  style: DiagramStyle;
  color: string;
  /** Handwriting mode for embedded labels */
  textMode?: WhiteboardTextMode;
  /** Fixed rough.js seed for stable re-renders */
  seed?: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function expandBounds(b: Bounds, x: number, y: number): void {
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x);
  b.maxY = Math.max(b.maxY, y);
}

function expandBoundsRect(
  b: Bounds,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  expandBounds(b, x, y);
  expandBounds(b, x + w, y + h);
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return {
    left: {
      x: x2 - ARROW_HEAD_LEN * Math.cos(angle - ARROW_HEAD_ANGLE),
      y: y2 - ARROW_HEAD_LEN * Math.sin(angle - ARROW_HEAD_ANGLE),
    },
    right: {
      x: x2 - ARROW_HEAD_LEN * Math.cos(angle + ARROW_HEAD_ANGLE),
      y: y2 - ARROW_HEAD_LEN * Math.sin(angle + ARROW_HEAD_ANGLE),
    },
  };
}

function ellipseArcD(cx: number, cy: number, rx: number, ry: number): string {
  return [
    `M${round(cx - rx)} ${round(cy)}`,
    `A${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${round(cy)}`,
    `A${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${round(cy)}`,
  ].join("");
}

function polylineD(
  points: Array<{ x: number; y: number }>,
  close = false
): string {
  if (points.length < 2) return "";
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    parts.push(
      i === 0
        ? `M${round(p.x)} ${round(p.y)}`
        : `L${round(p.x)} ${round(p.y)}`
    );
  }
  if (close) parts.push("Z");
  return parts.join("");
}

function rectD(x: number, y: number, w: number, h: number): string {
  return `M${round(x)} ${round(y)}h${round(w)}v${round(h)}h${round(-w)}Z`;
}

function pushPath(
  paths: DiagramPathData[],
  d: string,
  stroke: string,
  strokeWidth = DEFAULT_STROKE_WIDTH
): void {
  if (!d) return;
  paths.push({ d, stroke, strokeWidth, role: "shape" });
}

function roughPaths(
  drawable: Drawable,
  stroke: string,
  strokeWidth: number
): DiagramPathData[] {
  const gen = rough.generator();
  return gen
    .toPaths(drawable)
    .filter((info) => typeof info.d === "string" && info.d.length > 0)
    .map((info) => ({
      d: info.d,
      stroke: info.stroke && info.stroke !== "none" ? info.stroke : stroke,
      strokeWidth: info.strokeWidth || strokeWidth,
      role: "shape" as const,
    }));
}

function makeRoughOptions(
  stroke: string,
  seed: number,
  fill?: string
): RoughOptions {
  return {
    stroke,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    // Soft hand-drawn look — avoid double-stroke clutter
    roughness: 0.55,
    bowing: 0.35,
    seed,
    fill: fill && fill !== "none" ? fill : undefined,
    fillStyle: fill && fill !== "none" ? "hachure" : undefined,
    hachureGap: 8,
    disableMultiStroke: true,
    disableMultiStrokeFill: true,
    maxRandomnessOffset: 1.5,
  };
}

function compileGeometry(
  prim: Exclude<DiagramPrimitive, { type: "label" }>,
  defaultColor: string,
  style: DiagramStyle,
  seed: number,
  bounds: Bounds
): DiagramPathData[] {
  const paths: DiagramPathData[] = [];
  const stroke = prim.color ?? defaultColor;

  if (style === "clean") {
    switch (prim.type) {
      case "line":
        expandBounds(bounds, prim.x1, prim.y1);
        expandBounds(bounds, prim.x2, prim.y2);
        pushPath(
          paths,
          `M${round(prim.x1)} ${round(prim.y1)}L${round(prim.x2)} ${round(prim.y2)}`,
          stroke
        );
        break;
      case "arrow": {
        expandBounds(bounds, prim.x1, prim.y1);
        expandBounds(bounds, prim.x2, prim.y2);
        pushPath(
          paths,
          `M${round(prim.x1)} ${round(prim.y1)}L${round(prim.x2)} ${round(prim.y2)}`,
          stroke
        );
        const head = arrowHeadPoints(prim.x1, prim.y1, prim.x2, prim.y2);
        expandBounds(bounds, head.left.x, head.left.y);
        expandBounds(bounds, head.right.x, head.right.y);
        pushPath(
          paths,
          `M${round(head.left.x)} ${round(head.left.y)}L${round(prim.x2)} ${round(prim.y2)}`,
          stroke
        );
        pushPath(
          paths,
          `M${round(head.right.x)} ${round(head.right.y)}L${round(prim.x2)} ${round(prim.y2)}`,
          stroke
        );
        break;
      }
      case "rect":
        expandBoundsRect(bounds, prim.x, prim.y, prim.w, prim.h);
        pushPath(paths, rectD(prim.x, prim.y, prim.w, prim.h), stroke);
        break;
      case "circle":
        expandBounds(bounds, prim.cx - prim.r, prim.cy - prim.r);
        expandBounds(bounds, prim.cx + prim.r, prim.cy + prim.r);
        pushPath(paths, ellipseArcD(prim.cx, prim.cy, prim.r, prim.r), stroke);
        break;
      case "ellipse":
        expandBounds(bounds, prim.cx - prim.rx, prim.cy - prim.ry);
        expandBounds(bounds, prim.cx + prim.rx, prim.cy + prim.ry);
        pushPath(
          paths,
          ellipseArcD(prim.cx, prim.cy, prim.rx, prim.ry),
          stroke
        );
        break;
      case "polyline":
        for (const p of prim.points) expandBounds(bounds, p.x, p.y);
        pushPath(paths, polylineD(prim.points, false), stroke);
        break;
      case "polygon":
        for (const p of prim.points) expandBounds(bounds, p.x, p.y);
        pushPath(paths, polylineD(prim.points, true), stroke);
        break;
    }
    return paths;
  }

  // sketchy
  const gen = rough.generator();
  const fill =
    "fill" in prim && typeof prim.fill === "string" ? prim.fill : undefined;
  const opts = makeRoughOptions(stroke, seed, fill);

  switch (prim.type) {
    case "line":
      expandBounds(bounds, prim.x1, prim.y1);
      expandBounds(bounds, prim.x2, prim.y2);
      paths.push(
        ...roughPaths(
          gen.line(prim.x1, prim.y1, prim.x2, prim.y2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    case "arrow": {
      expandBounds(bounds, prim.x1, prim.y1);
      expandBounds(bounds, prim.x2, prim.y2);
      paths.push(
        ...roughPaths(
          gen.line(prim.x1, prim.y1, prim.x2, prim.y2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      const head = arrowHeadPoints(prim.x1, prim.y1, prim.x2, prim.y2);
      expandBounds(bounds, head.left.x, head.left.y);
      expandBounds(bounds, head.right.x, head.right.y);
      paths.push(
        ...roughPaths(
          gen.line(head.left.x, head.left.y, prim.x2, prim.y2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      paths.push(
        ...roughPaths(
          gen.line(head.right.x, head.right.y, prim.x2, prim.y2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    }
    case "rect":
      expandBoundsRect(bounds, prim.x, prim.y, prim.w, prim.h);
      paths.push(
        ...roughPaths(
          gen.rectangle(prim.x, prim.y, prim.w, prim.h, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    case "circle":
      expandBounds(bounds, prim.cx - prim.r, prim.cy - prim.r);
      expandBounds(bounds, prim.cx + prim.r, prim.cy + prim.r);
      paths.push(
        ...roughPaths(
          gen.circle(prim.cx, prim.cy, prim.r * 2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    case "ellipse":
      expandBounds(bounds, prim.cx - prim.rx, prim.cy - prim.ry);
      expandBounds(bounds, prim.cx + prim.rx, prim.cy + prim.ry);
      paths.push(
        ...roughPaths(
          gen.ellipse(prim.cx, prim.cy, prim.rx * 2, prim.ry * 2, opts),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    case "polyline":
      for (const p of prim.points) expandBounds(bounds, p.x, p.y);
      paths.push(
        ...roughPaths(
          gen.linearPath(
            prim.points.map((p) => [p.x, p.y] as [number, number]),
            opts
          ),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
    case "polygon":
      for (const p of prim.points) expandBounds(bounds, p.x, p.y);
      paths.push(
        ...roughPaths(
          gen.polygon(
            prim.points.map((p) => [p.x, p.y] as [number, number]),
            opts
          ),
          stroke,
          DEFAULT_STROKE_WIDTH
        )
      );
      break;
  }

  return paths;
}

async function compileLabel(
  prim: Extract<DiagramPrimitive, { type: "label" }>,
  defaultColor: string,
  textMode: WhiteboardTextMode,
  bounds: Bounds
): Promise<DiagramPathData[]> {
  const fontSize = prim.fontSize ?? LABEL_FONT_SIZE;
  const stroke = prim.color ?? defaultColor;
  try {
    const parsed = await textToSvgPaths(prim.text, textMode, fontSize);
    const vb = parsed.viewBox.split(/\s+/).map(Number);
    const minX = vb[0] ?? 0;
    const minY = vb[1] ?? 0;
    const vw = vb[2] ?? fontSize;
    const vh = vb[3] ?? fontSize;
    // Center on (x,y) with a small upward optical correction for Hershey
    const dx = prim.x - (minX + vw / 2);
    const dy = prim.y - (minY + vh / 2) - fontSize * 0.08;
    expandBounds(bounds, prim.x - vw / 2, prim.y - vh / 2);
    expandBounds(bounds, prim.x + vw / 2, prim.y + vh / 2);
    return parsed.paths.map((p) => ({
      d: p.d,
      transform:
        p.transform != null
          ? `translate(${round(dx)} ${round(dy)}) ${p.transform}`
          : `translate(${round(dx)} ${round(dy)})`,
      stroke,
      strokeWidth: Math.max(1.2, fontSize * 0.06),
      role: "label" as const,
    }));
  } catch (err) {
    console.error("[diagramToSvgPaths] label compile failed:", err);
    expandBounds(bounds, prim.x, prim.y);
    return [];
  }
}

/**
 * Compile primitives to ordered DiagramPathData[] for the animated shape.
 * Must be called in a browser context (labels use opentype / hershey).
 */
export async function diagramToSvgPaths(
  primitives: DiagramPrimitive[],
  options: DiagramCompileOptions
): Promise<ParsedDiagramPaths> {
  if (typeof window === "undefined") {
    throw new Error("diagramToSvgPaths must be called in a browser context");
  }

  const { style, color } = options;
  const textMode = options.textMode ?? "stroke";
  const seed = options.seed ?? 42;
  const bounds = emptyBounds();
  const merged: DiagramPathData[] = [];

  for (let i = 0; i < primitives.length; i++) {
    const prim = primitives[i]!;
    if (prim.type === "label") {
      const labelPaths = await compileLabel(prim, color, textMode, bounds);
      merged.push(...labelPaths);
    } else {
      merged.push(
        ...compileGeometry(prim, color, style, seed + i * 17, bounds)
      );
    }
  }

  const capped = merged.slice(0, MAX_ANIMATED_DIAGRAM_PATHS);

  if (!Number.isFinite(bounds.minX) || capped.length === 0) {
    return { paths: capped, viewBox: "0 0 200 120" };
  }

  const minX = bounds.minX - BOUNDS_PAD;
  const minY = bounds.minY - BOUNDS_PAD;
  const vw = Math.max(bounds.maxX - bounds.minX + BOUNDS_PAD * 2, 40);
  const vh = Math.max(bounds.maxY - bounds.minY + BOUNDS_PAD * 2, 40);

  return {
    paths: capped,
    viewBox: `${round(minX)} ${round(minY)} ${round(vw)} ${round(vh)}`,
  };
}

/** Estimate on-canvas shape size from a diagram viewBox (already in px). */
export function estimateDiagramShapeDimensions(viewBox: string): {
  w: number;
  h: number;
} {
  const parts = viewBox.split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) {
    return { w: 320, h: 200 };
  }
  const [, , vw, vh] = parts;
  if (!vw || !vh) return { w: 320, h: 200 };
  return {
    w: Math.max(Math.ceil(vw), 48),
    h: Math.max(Math.ceil(vh), 48),
  };
}
