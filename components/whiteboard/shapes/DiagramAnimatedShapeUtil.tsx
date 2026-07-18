"use client";

import { useState, useEffect } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  useEditor,
  type TLBaseShape,
} from "@tldraw/tldraw";
import type { DiagramPathData, DiagramStyle } from "@/lib/types";
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

function mkStyle(): Validatable<DiagramStyle> {
  return {
    validate(v) {
      if (v === undefined || v === null) return "sketchy";
      if (v === "sketchy" || v === "clean") return v;
      throw new TypeError(`Expected "sketchy" | "clean", got ${String(v)}`);
    },
  };
}

function mkArrayOfDiagramPath(): Validatable<DiagramPathData[]> {
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
        const stroke = obj.stroke;
        if (
          stroke !== undefined &&
          stroke !== null &&
          typeof stroke !== "string"
        )
          throw new TypeError(
            `svgPaths[${i}].stroke must be a string or undefined`
          );
        const fill = obj.fill;
        if (fill !== undefined && fill !== null && typeof fill !== "string")
          throw new TypeError(
            `svgPaths[${i}].fill must be a string or undefined`
          );
        const sw = obj.strokeWidth;
        if (sw !== undefined && sw !== null && typeof sw !== "number")
          throw new TypeError(
            `svgPaths[${i}].strokeWidth must be a number or undefined`
          );
        const role = obj.role;
        if (
          role !== undefined &&
          role !== null &&
          role !== "shape" &&
          role !== "label"
        ) {
          throw new TypeError(
            `svgPaths[${i}].role must be "shape" | "label" or undefined`
          );
        }
        return {
          d: obj.d,
          transform: typeof t === "string" ? t : undefined,
          stroke: typeof stroke === "string" ? stroke : undefined,
          fill: typeof fill === "string" ? fill : undefined,
          strokeWidth: typeof sw === "number" ? sw : undefined,
          role: role === "shape" || role === "label" ? role : undefined,
        } satisfies DiagramPathData;
      });
    },
  };
}

// ─── Type Augmentation ────────────────────────────────────────────────────────

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ai-diagram-animated": DiagramAnimatedProps;
  }
}

// ─── Shape Type ───────────────────────────────────────────────────────────────

export const AI_DIAGRAM_ANIMATED_TYPE = "ai-diagram-animated" as const;

interface DiagramAnimatedProps {
  specKey: string;
  title: string;
  svgPaths: DiagramPathData[];
  viewBox: string;
  w: number;
  h: number;
  animate: boolean;
  /** Legacy — used as shapeStepMs fallback for older persisted shapes. */
  stepMs: number;
  shapeStepMs: number;
  labelStepMs: number;
  style: DiagramStyle;
  color: string;
}

export type DiagramAnimatedShape = TLBaseShape<
  typeof AI_DIAGRAM_ANIMATED_TYPE,
  DiagramAnimatedProps
>;

const MAX_ANIMATED = 400;
const FALLBACK_STEP_MS = 160;
const DEFAULT_STROKE = 2;

function resolveShapeStepMs(props: DiagramAnimatedProps): number {
  if (typeof props.shapeStepMs === "number" && props.shapeStepMs >= 0) {
    return props.shapeStepMs;
  }
  if (typeof props.stepMs === "number" && props.stepMs > 0) {
    return props.stepMs;
  }
  return FALLBACK_STEP_MS;
}

function resolveLabelStepMs(props: DiagramAnimatedProps): number {
  if (typeof props.labelStepMs === "number" && props.labelStepMs >= 0) {
    return props.labelStepMs;
  }
  // Older shapes: labels used the same pace as shapes
  return resolveShapeStepMs(props);
}

function pathSlotMs(
  path: DiagramPathData,
  shapeStepMs: number,
  labelStepMs: number
): number {
  const raw = path.role === "label" ? labelStepMs : shapeStepMs;
  // 0-speed paths still take 1ms so draw order stays sequential
  return Math.max(1, raw);
}

/** Cumulative delay before each path starts, plus total animation ms. */
function buildPathTiming(
  paths: DiagramPathData[],
  shapeStepMs: number,
  labelStepMs: number
): { delays: number[]; totalMs: number } {
  const delays: number[] = [];
  let t = 0;
  for (const p of paths) {
    delays.push(t);
    t += pathSlotMs(p, shapeStepMs, labelStepMs);
  }
  return { delays, totalMs: t };
}

// ─── Renderer Component ───────────────────────────────────────────────────────

interface RendererProps {
  shape: DiagramAnimatedShape;
}

function DiagramAnimatedRenderer({ shape }: RendererProps) {
  const editor = useEditor();
  const { svgPaths, viewBox, w, h, animate, color, title } = shape.props;

  const shapeStepMs = resolveShapeStepMs(shape.props);
  const labelStepMs = resolveLabelStepMs(shape.props);

  const anyAnimated = shapeStepMs > 0 || labelStepMs > 0;
  const canAnimate =
    animate &&
    anyAnimated &&
    svgPaths.length > 0 &&
    svgPaths.length <= MAX_ANIMATED;

  const { delays, totalMs } = canAnimate
    ? buildPathTiming(svgPaths, shapeStepMs, labelStepMs)
    : { delays: [] as number[], totalMs: 0 };

  const [drawn, setDrawn] = useState(!canAnimate);

  useEffect(() => {
    if (!canAnimate) {
      setDrawn(true);
      notifyLatexAnimationComplete(shape.id);
      return;
    }

    setDrawn(false);
    const settleMs =
      totalMs + Math.max(Math.max(shapeStepMs, labelStepMs, 1), 200);
    const t = setTimeout(() => {
      setDrawn(true);
      try {
        editor.updateShape({
          id: shape.id,
          type: AI_DIAGRAM_ANIMATED_TYPE,
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
          {title || "Diagram"}
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
          @keyframes tl-draw-diagram-path {
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
        aria-label={title ? `Diagram: ${title}` : "Diagram"}
      >
        {svgPaths.map((p, i) => {
          const stroke = p.stroke ?? color;
          const strokeWidth = p.strokeWidth ?? DEFAULT_STROKE;
          const animMs = pathSlotMs(p, shapeStepMs, labelStepMs);
          const delay = delays[i] ?? 0;

          if (drawn) {
            if (p.fill) {
              return (
                <path
                  key={i}
                  d={p.d}
                  transform={p.transform}
                  fill={p.fill}
                  stroke={stroke}
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
                fill="none"
                stroke={stroke}
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
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              style={{
                strokeDashoffset: 1,
                animation: `tl-draw-diagram-path ${animMs}ms linear forwards`,
                animationDelay: `${delay}ms`,
              }}
            />
          );
        })}
      </svg>
    </HTMLContainer>
  );
}

// ─── Shape Util ───────────────────────────────────────────────────────────────

export class DiagramAnimatedShapeUtil extends BaseBoxShapeUtil<DiagramAnimatedShape> {
  static override type = AI_DIAGRAM_ANIMATED_TYPE;

  static override props = {
    specKey: mkString(""),
    title: mkString(""),
    viewBox: mkString(),
    w: mkNumber(),
    h: mkNumber(),
    svgPaths: mkArrayOfDiagramPath(),
    animate: mkBoolean(false),
    stepMs: mkNumber(0),
    shapeStepMs: mkNumber(0),
    labelStepMs: mkNumber(0),
    style: mkStyle(),
    color: mkString("#1a1a1a"),
  };

  override getDefaultProps(): DiagramAnimatedProps {
    return {
      specKey: "",
      title: "",
      svgPaths: [],
      viewBox: "0 0 200 120",
      w: 320,
      h: 200,
      animate: false,
      stepMs: 0,
      shapeStepMs: 0,
      labelStepMs: 0,
      style: "sketchy",
      color: "#1a1a1a",
    };
  }

  override component(shape: DiagramAnimatedShape) {
    return <DiagramAnimatedRenderer shape={shape} />;
  }

  override getIndicatorPath(shape: DiagramAnimatedShape): Path2D {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
