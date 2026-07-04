"use client";

import { useState, useEffect } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  type TLBaseShape,
} from "@tldraw/tldraw";
import type { SvgPathData } from "@/lib/types";

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
              strokeWidth={0.08}
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
