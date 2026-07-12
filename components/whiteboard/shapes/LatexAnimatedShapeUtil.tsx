"use client";

import { useState, useEffect } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useEditor,
  type TLBaseShape,
} from "@tldraw/tldraw";
import type { SvgPathData } from "@/lib/types";
import { notifyLatexAnimationComplete } from "@/lib/whiteboard/latexAnimationBridge";

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

function mkNumber(defaultValue?: number): Validatable<number> {
  return {
    validate(v) {
      if ((v === undefined || v === null) && defaultValue !== undefined) {
        return defaultValue;
      }
      if (typeof v !== "number")
        throw new TypeError(`Expected number, got ${typeof v}`);
      return v;
    },
  };
}

/** Coerces missing/null to `defaultValue` so older persisted shapes still load. */
function mkBoolean(defaultValue = false): Validatable<boolean> {
  return {
    validate(v) {
      if (v === undefined || v === null) return defaultValue;
      if (typeof v !== "boolean")
        throw new TypeError(`Expected boolean, got ${typeof v}`);
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
          throw new TypeError(
            `svgPaths[${i}].transform must be a string or undefined`
          );
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
  /**
   * When true, play the stroke-draw animation once, then settle to filled
   * and flip this flag to false so remounts / refresh don't re-animate.
   */
  animate: boolean;
  /**
   * Per-path draw duration (ms) baked in at creation from the reading-speed
   * slider. 0 = skip stroke animation. Changing the slider later must NOT
   * mutate this — only new shapes pick up the new speed.
   */
  stepMs: number;
}

export type LatexAnimatedShape = TLBaseShape<
  typeof AI_LATEX_ANIMATED_TYPE,
  LatexAnimatedProps
>;

/**
 * Maximum number of paths to animate sequentially.
 * Complex equations with more paths than this render statically.
 */
const MAX_ANIMATED = 200;

const FALLBACK_STEP_MS = 200;

// ─── Renderer Component ───────────────────────────────────────────────────────

interface RendererProps {
  shape: LatexAnimatedShape;
}

function LatexAnimatedRenderer({ shape }: RendererProps) {
  const editor = useEditor();
  const { svgPaths, viewBox, w, h, animate, stepMs } = shape.props;

  // MathJax glyph paths live in a large coordinate space (viewBox width can be
  // thousands of units) that the SVG scales down to `w`. Derive stroke width
  // so the on-screen pen stays ~2px.
  const viewBoxWidth = Number(viewBox.split(/\s+/)[2] ?? "0") || w;
  const strokeWidth = viewBoxWidth / (w / 2);

  const effectiveStepMs =
    typeof stepMs === "number" && stepMs > 0 ? stepMs : FALLBACK_STEP_MS;

  const canAnimate =
    animate &&
    stepMs > 0 &&
    svgPaths.length > 0 &&
    svgPaths.length <= MAX_ANIMATED;

  const totalMs = canAnimate ? svgPaths.length * effectiveStepMs : 0;

  const [drawn, setDrawn] = useState(!canAnimate);

  // Depend only on shape.id + animate. stepMs is baked into the shape at
  // creation — changing the reading-speed slider must not restart this draw.
  useEffect(() => {
    if (!canAnimate) {
      setDrawn(true);
      // Restored / instant shapes: unblock any waiter immediately
      notifyLatexAnimationComplete(shape.id);
      return;
    }

    setDrawn(false);
    const settleMs = totalMs + Math.max(effectiveStepMs, 200);
    const t = setTimeout(() => {
      setDrawn(true);
      try {
        editor.updateShape({
          id: shape.id,
          type: AI_LATEX_ANIMATED_TYPE,
          props: { animate: false },
        });
      } catch {
        // Shape may have been deleted mid-animation
      }
      notifyLatexAnimationComplete(shape.id);
    }, settleMs);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id, animate]);

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
                animation: `tl-draw-path ${effectiveStepMs}ms linear forwards`,
                animationDelay: `${i * effectiveStepMs}ms`,
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
    animate: mkBoolean(false),
    // Default 0 for shapes persisted before stepMs existed → treat as settled
    stepMs: mkNumber(0),
  };

  override getDefaultProps(): LatexAnimatedProps {
    return {
      latex: "",
      svgPaths: [],
      viewBox: "0 0 100 40",
      w: 400,
      h: 100,
      animate: false,
      stepMs: 0,
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
