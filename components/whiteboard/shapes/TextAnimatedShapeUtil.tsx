"use client";

import { useState, useEffect } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useEditor,
  type TLBaseShape,
} from "@tldraw/tldraw";
import type { SvgPathData, WhiteboardTextDrawMode } from "@/lib/types";
import { notifyLatexAnimationComplete } from "@/lib/whiteboard/latexAnimationBridge";

// ─── Inline prop validators ────────────────────────────────────────────────────

type Validatable<T> = { validate(value: unknown): T };

function mkString(defaultValue?: string): Validatable<string> {
  return {
    validate(v) {
      if ((v === undefined || v === null) && defaultValue !== undefined) {
        return defaultValue;
      }
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

function mkMode(): Validatable<WhiteboardTextDrawMode> {
  return {
    validate(v) {
      if (v === undefined || v === null) return "stroke";
      if (v === "stroke" || v === "outline") return v;
      throw new TypeError(`Expected "stroke" | "outline", got ${String(v)}`);
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
    "ai-text-animated": TextAnimatedProps;
  }
}

// ─── Shape Type ───────────────────────────────────────────────────────────────

export const AI_TEXT_ANIMATED_TYPE = "ai-text-animated" as const;

interface TextAnimatedProps {
  text: string;
  svgPaths: SvgPathData[];
  viewBox: string;
  w: number;
  h: number;
  animate: boolean;
  stepMs: number;
  mode: WhiteboardTextDrawMode;
  color: string;
  /** Font size (px) used when paths were generated — for rescale. */
  fontSize: number;
}

export type TextAnimatedShape = TLBaseShape<
  typeof AI_TEXT_ANIMATED_TYPE,
  TextAnimatedProps
>;

const MAX_ANIMATED = 200;
const FALLBACK_STEP_MS = 200;

// ─── Renderer Component ───────────────────────────────────────────────────────

interface RendererProps {
  shape: TextAnimatedShape;
}

function TextAnimatedRenderer({ shape }: RendererProps) {
  const editor = useEditor();
  const { svgPaths, viewBox, w, h, animate, stepMs, mode, color } = shape.props;

  const viewBoxWidth = Number(viewBox.split(/\s+/)[2] ?? "0") || w;
  // Stroke mode: pen-like (~2.8px). Outline mode: thin tracer like LaTeX.
  const targetPx = mode === "stroke" ? 2.8 : 1.8;
  const strokeWidth = viewBoxWidth / (w / targetPx);

  const effectiveStepMs =
    typeof stepMs === "number" && stepMs > 0 ? stepMs : FALLBACK_STEP_MS;

  const canAnimate =
    animate &&
    stepMs > 0 &&
    svgPaths.length > 0 &&
    svgPaths.length <= MAX_ANIMATED;

  const totalMs = canAnimate ? svgPaths.length * effectiveStepMs : 0;

  const [drawn, setDrawn] = useState(!canAnimate);

  useEffect(() => {
    if (!canAnimate) {
      setDrawn(true);
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
          type: AI_TEXT_ANIMATED_TYPE,
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
        <span style={{ fontSize: 14, color: color || "#1a1a1a" }}>
          {shape.props.text}
        </span>
      </HTMLContainer>
    );
  }

  const paintColor = color || "#1a1a1a";

  return (
    <HTMLContainer
      style={{ width: w, height: h, overflow: "visible", pointerEvents: "none" }}
    >
      {!drawn && (
        <style>{`
          @keyframes tl-draw-text-path {
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
        aria-label={`Whiteboard text: ${shape.props.text}`}
      >
        {svgPaths.map((p, i) => {
          if (drawn) {
            // Stroke mode: single-line glyphs have no fill — keep stroke.
            // Outline mode: settle to filled letterforms.
            if (mode === "stroke") {
              return (
                <path
                  key={i}
                  d={p.d}
                  transform={p.transform}
                  fill="none"
                  stroke={paintColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }
            return (
              <path
                key={i}
                d={p.d}
                transform={p.transform}
                fill={paintColor}
              />
            );
          }

          return (
            <path
              key={i}
              d={p.d}
              transform={p.transform}
              fill="none"
              stroke={paintColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: 1,
                animation: `tl-draw-text-path ${effectiveStepMs}ms linear forwards`,
                animationDelay: `${i * effectiveStepMs}ms`,
              }}
            />
          );
        })}
      </svg>
    </HTMLContainer>
  );
}

// ─── Shape Util ───────────────────────────────────────────────────────────────

export class TextAnimatedShapeUtil extends BaseBoxShapeUtil<TextAnimatedShape> {
  static override type = AI_TEXT_ANIMATED_TYPE;

  static override props = {
    text: mkString(),
    viewBox: mkString(),
    w: mkNumber(),
    h: mkNumber(),
    svgPaths: mkArrayOfSvgPath(),
    animate: mkBoolean(false),
    stepMs: mkNumber(0),
    mode: mkMode(),
    color: mkString("#1a1a1a"),
    fontSize: mkNumber(36),
  };

  override getDefaultProps(): TextAnimatedProps {
    return {
      text: "",
      svgPaths: [],
      viewBox: "0 0 100 40",
      w: 200,
      h: 48,
      animate: false,
      stepMs: 0,
      mode: "stroke",
      color: "#1a1a1a",
      fontSize: 36,
    };
  }

  override component(shape: TextAnimatedShape) {
    return <TextAnimatedRenderer shape={shape} />;
  }

  override getIndicatorPath(shape: TextAnimatedShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
