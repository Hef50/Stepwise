"use client";

import { useState, useEffect } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type TLBaseShape,
} from "@tldraw/tldraw";
import type { SvgPathData } from "@/lib/types";

// ─── Inline prop validators ────────────────────────────────────────────────────
// Satisfy tldraw's Validatable<T> interface without importing @tldraw/validate
// directly, which would cause a duplicate-module instance warning in Turbopack.

type Validatable<T> = { validate(value: unknown): T };

function mkString(): Validatable<string> {
  return {
    validate(v) {
      if (typeof v !== "string")
        throw new TypeError(`Expected string, got ${typeof v}`);
      return v;
    },
  };
}

function mkNumber(): Validatable<number> {
  return {
    validate(v) {
      if (typeof v !== "number")
        throw new TypeError(`Expected number, got ${typeof v}`);
      return v;
    },
  };
}

function mkArrayOfSvgPath(): Validatable<SvgPathData[]> {
  return {
    validate(v) {
      if (!Array.isArray(v)) throw new TypeError("Expected array for svgPaths");
      return v.map((item: unknown, i: number) => {
        if (typeof item !== "object" || item === null)
          throw new TypeError(`svgPaths[${i}] must be an object`);
        const obj = item as Record<string, unknown>;
        if (typeof obj.d !== "string")
          throw new TypeError(`svgPaths[${i}].d must be a string`);
        const t = obj.transform;
        if (t !== undefined && t !== null && typeof t !== "string")
          throw new TypeError(`svgPaths[${i}].transform must be a string or undefined`);
        return {
          d: obj.d,
          transform: typeof t === "string" ? t : undefined,
        } satisfies SvgPathData;
      });
    },
  };
}

// ─── Type Augmentation ────────────────────────────────────────────────────────

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ai-latex-animated": LatexAnimatedProps;
  }
}

// ─── Shape Type ───────────────────────────────────────────────────────────────

export const AI_LATEX_ANIMATED_TYPE = "ai-latex-animated" as const;

interface LatexAnimatedProps {
  latex: string;
  svgPaths: SvgPathData[];
  viewBox: string;
  w: number;
  h: number;
}

export type LatexAnimatedShape = TLBaseShape<
  typeof AI_LATEX_ANIMATED_TYPE,
  LatexAnimatedProps
>;

// ─── Animation Constants ──────────────────────────────────────────────────────

/** Duration of the draw animation for each individual path (ms) */
const STEP_MS = 80;

/**
 * Maximum number of paths to animate sequentially.
 * Complex equations with more paths than this render statically to
 * avoid unacceptably long animation durations.
 */
const MAX_ANIMATED = 200;

// ─── Renderer Component ───────────────────────────────────────────────────────

interface RendererProps {
  shape: LatexAnimatedShape;
}

function LatexAnimatedRenderer({ shape }: RendererProps) {
  const { svgPaths, viewBox, w, h } = shape.props;

  // MathJax glyph paths live in a large coordinate space (viewBox width can be
  // thousands of units) that the SVG scales down to `w`. A fixed strokeWidth in
  // those units renders as a fraction of a pixel. Derive the stroke from the
  // viewBox so the on-screen pen width stays visible and consistent (~2px):
  //   onScreenPx = strokeWidth * (w / viewBoxWidth)  ⇒  strokeWidth = viewBoxWidth / (w / 2)
  const viewBoxWidth = Number(viewBox.split(/\s+/)[2] ?? "0") || w;
  const strokeWidth = viewBoxWidth / (w / 2);

  const shouldAnimate = svgPaths.length > 0 && svgPaths.length <= MAX_ANIMATED;
  const totalMs = shouldAnimate ? svgPaths.length * STEP_MS : 0;

  const [drawn, setDrawn] = useState(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) {
      setDrawn(true);
      return;
    }
    // Reset animation state if shape props change (new equation placed)
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), totalMs + 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id, svgPaths.length, totalMs]);

  if (svgPaths.length === 0) {
    return (
      <HTMLContainer
        style={{ width: w, height: h, display: "flex", alignItems: "center" }}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-3, #888)" }}>
          {shape.props.latex}
        </span>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer
      style={{ width: w, height: h, overflow: "visible", pointerEvents: "none" }}
    >
      {!drawn && (
        <style>{`
          @keyframes tl-draw-path {
            from { stroke-dashoffset: 1; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      )}
      <svg
        viewBox={viewBox}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`Math equation: ${shape.props.latex}`}
      >
        {svgPaths.map((p, i) =>
          drawn ? (
            <path
              key={i}
              d={p.d}
              transform={p.transform}
              fill="currentColor"
            />
          ) : (
            <path
              key={i}
              d={p.d}
              transform={p.transform}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: 1,
                animation: `tl-draw-path ${STEP_MS}ms linear forwards`,
                animationDelay: `${i * STEP_MS}ms`,
              }}
            />
          )
        )}
      </svg>
    </HTMLContainer>
  );
}

// ─── Shape Util ───────────────────────────────────────────────────────────────

export class LatexAnimatedShapeUtil extends BaseBoxShapeUtil<LatexAnimatedShape> {
  static override type = AI_LATEX_ANIMATED_TYPE;

  static override props = {
    latex: mkString(),
    viewBox: mkString(),
    w: mkNumber(),
    h: mkNumber(),
    svgPaths: mkArrayOfSvgPath(),
  };

  override getDefaultProps(): LatexAnimatedProps {
    return {
      latex: "",
      svgPaths: [],
      viewBox: "0 0 100 40",
      w: 400,
      h: 100,
    };
  }

  override component(shape: LatexAnimatedShape) {
    return <LatexAnimatedRenderer shape={shape} />;
  }

  override getIndicatorPath(shape: LatexAnimatedShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
