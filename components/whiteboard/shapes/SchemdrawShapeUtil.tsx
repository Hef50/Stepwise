"use client";

/**
 * SchemdrawShapeUtil — circuit / schematic placeholder on the tldraw canvas.
 *
 * Schemdraw is Python-only; this renders an elegant SVG placeholder with a
 * code panel, mirroring the chat-bubble SchemdrawDiagram but as a live canvas
 * shape. Self-contained — do NOT import from sibling shape files.
 */

import { useRef } from "react";
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  resizeBox,
  type TLBaseShape,
  type RecordProps,
  type Geometry2d,
  type TLResizeInfo,
  type TLShapeId,
} from "@tldraw/tldraw";
import { DEFAULT_SHAPE_WIDTH, MIN_WIDTH, MIN_HEIGHT } from "./baseShape";
import { useAutoSize } from "./useAutoSize";

// ── Type augmentation ────────────────────────────────────────────────────────
export const AI_SCHEMDRAW_TYPE = "ai-schemdraw" as const;

export interface AiSchemdrawProps {
  code: string;
  w: number;
  h: number;
}

declare module "@tldraw/tldraw" {
  interface TLGlobalShapePropsMap {
    [AI_SCHEMDRAW_TYPE]: AiSchemdrawProps;
  }
}

export type AiSchemdrawShape = TLBaseShape<typeof AI_SCHEMDRAW_TYPE, AiSchemdrawProps>;

// ── Renderer component ────────────────────────────────────────────────────────
function SchemdrawRenderer({
  shapeId,
  code,
  w,
}: {
  shapeId: TLShapeId;
  code: string;
  w: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  useAutoSize(shapeId, outerRef, { minHeight: 80 });

  return (
    <div
      ref={outerRef}
      style={{
        width: w,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        backgroundColor: "#fefce8",
        border: "1.5px solid #d97706",
        borderRadius: 8,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        fontSize: 12,
        color: "#92400e",
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: 0.3 }}>
          ⚡ Schemdraw Circuit
        </span>
      </div>

      {/* Actual generated code — Schemdraw is Python-only, no in-browser render */}
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          borderRadius: 6,
          background: "#fef3c7",
          fontSize: 10,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "#78350f",
        }}
      >
        <code>{code || "# (no code provided)"}</code>
      </pre>

      <p style={{ fontSize: 10, margin: 0, opacity: 0.7 }}>
        Python Schemdraw — run locally or in Jupyter to render.
      </p>
    </div>
  );
}

// ── ShapeUtil ────────────────────────────────────────────────────────────────
export class SchemdrawShapeUtil extends ShapeUtil<AiSchemdrawShape> {
  static override type = AI_SCHEMDRAW_TYPE;

  static override props: RecordProps<AiSchemdrawShape> = {
    code: T.string,
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): AiSchemdrawShape["props"] {
    return {
      code: "",
      w: DEFAULT_SHAPE_WIDTH,
      h: 260,
    };
  }

  override getGeometry(shape: AiSchemdrawShape): Geometry2d {
    return new Rectangle2d({
      width: Math.max(shape.props.w, MIN_WIDTH),
      height: Math.max(shape.props.h, MIN_HEIGHT),
      isFilled: true,
    });
  }

  override component(shape: AiSchemdrawShape) {
    return (
      <HTMLContainer>
        <SchemdrawRenderer
          shapeId={shape.id}
          code={shape.props.code}
          w={shape.props.w}
        />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: AiSchemdrawShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override canResize() {
    return true;
  }

  override onResize(shape: AiSchemdrawShape, info: TLResizeInfo<AiSchemdrawShape>) {
    return resizeBox(shape, info);
  }
}
