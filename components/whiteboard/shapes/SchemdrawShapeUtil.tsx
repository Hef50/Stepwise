"use client";

/**
 * SchemdrawShapeUtil — circuit / schematic placeholder on the tldraw canvas.
 *
 * Schemdraw is Python-only; this renders an elegant SVG placeholder with a
 * code panel, mirroring the chat-bubble SchemdrawDiagram but as a live canvas
 * shape. Self-contained — do NOT import from sibling shape files.
 */

import { useState } from "react";
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
} from "@tldraw/tldraw";
import { DEFAULT_SHAPE_WIDTH, MIN_WIDTH, MIN_HEIGHT } from "./baseShape";

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

// ── Inline SVG placeholder ────────────────────────────────────────────────────
const CircuitSVG = () => (
  <svg
    viewBox="0 0 320 160"
    style={{ width: "100%", maxWidth: 280 }}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="Circuit schematic placeholder"
  >
    <line x1="20" y1="30" x2="140" y2="30" />
    <line x1="20" y1="130" x2="300" y2="130" />
    <line x1="20" y1="30" x2="20" y2="130" />
    <line x1="300" y1="30" x2="300" y2="130" />
    <line x1="190" y1="30" x2="300" y2="30" />
    <polyline points="140,30 148,20 156,40 164,20 172,40 180,20 188,40 196,30" />
    <text x="158" y="60" fontSize="10" textAnchor="middle" stroke="none" fill="currentColor">R</text>
    <line x1="300" y1="55" x2="300" y2="75" />
    <line x1="290" y1="75" x2="310" y2="75" />
    <line x1="290" y1="85" x2="310" y2="85" />
    <line x1="300" y1="85" x2="300" y2="105" />
    <text x="318" y="83" fontSize="10" textAnchor="start" stroke="none" fill="currentColor">C</text>
    <line x1="20" y1="55" x2="20" y2="65" />
    <line x1="10" y1="65" x2="30" y2="65" />
    <line x1="14" y1="72" x2="26" y2="72" />
    <line x1="20" y1="72" x2="20" y2="82" />
    <text x="36" y="72" fontSize="10" textAnchor="start" stroke="none" fill="currentColor">V</text>
    <path d="M 80,130 A 10,10 0 0,1 100,130 A 10,10 0 0,1 120,130 A 10,10 0 0,1 140,130 A 10,10 0 0,1 160,130" />
    <text x="120" y="150" fontSize="10" textAnchor="middle" stroke="none" fill="currentColor">L</text>
    <circle cx="20" cy="30" r="3" fill="currentColor" stroke="none" />
    <circle cx="300" cy="30" r="3" fill="currentColor" stroke="none" />
    <circle cx="20" cy="130" r="3" fill="currentColor" stroke="none" />
    <circle cx="300" cy="130" r="3" fill="currentColor" stroke="none" />
  </svg>
);

// ── Renderer component ────────────────────────────────────────────────────────
function SchemdrawRenderer({ code, w, h }: { code: string; w: number; h: number }) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div
      style={{
        width: w,
        minHeight: h,
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
        overflow: "hidden",
        pointerEvents: "all",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: 0.3 }}>
          ⚡ Schemdraw Circuit
        </span>
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid #d97706",
            background: "transparent",
            color: "#92400e",
            cursor: "pointer",
          }}
        >
          {showCode ? "Hide code" : "View code"}
        </button>
      </div>

      {/* Circuit SVG */}
      {!showCode && (
        <div style={{ display: "flex", justifyContent: "center", color: "#78350f" }}>
          <CircuitSVG />
        </div>
      )}

      {/* Code view */}
      {showCode && (
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            borderRadius: 6,
            background: "#fef3c7",
            fontSize: 10,
            fontFamily: "monospace",
            overflowX: "auto",
            maxHeight: h - 60,
            color: "#78350f",
          }}
        >
          <code>{code}</code>
        </pre>
      )}

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
          code={shape.props.code}
          w={shape.props.w}
          h={shape.props.h}
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
