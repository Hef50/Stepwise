"use client";

/**
 * MermaidShapeUtil — live Mermaid diagram rendered on the tldraw canvas.
 *
 * Self-contained: type def + props + ShapeUtil + React component + indicator.
 * Rendering logic mirrors components/diagrams/MermaidDiagram.tsx but is
 * isolated here so both can evolve independently.
 * Do NOT import from sibling shape files.
 */

import { useEffect, useRef, useState, useId } from "react";
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
import { DEFAULT_SHAPE_WIDTH, DEFAULT_SHAPE_HEIGHT, MIN_WIDTH, MIN_HEIGHT } from "./baseShape";

// ── Type augmentation ────────────────────────────────────────────────────────
export const AI_MERMAID_TYPE = "ai-mermaid" as const;

export interface AiMermaidProps {
  code: string;
  w: number;
  h: number;
}

declare module "@tldraw/tldraw" {
  interface TLGlobalShapePropsMap {
    [AI_MERMAID_TYPE]: AiMermaidProps;
  }
}

export type AiMermaidShape = TLBaseShape<typeof AI_MERMAID_TYPE, AiMermaidProps>;

// ── Mermaid renderer component ───────────────────────────────────────────────
function MermaidRenderer({ code, w, h }: { code: string; w: number; h: number }) {
  const id = useId();
  const containerId = `mmd-shape-${id.replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          fontFamily: "inherit",
        });
        const { svg } = await mermaid.render(containerId, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, containerId]);

  return (
    <div
      style={{
        width: w,
        minHeight: h,
        padding: "12px",
        backgroundColor: "hsl(var(--background, 0 0% 100%))",
        border: "1.5px solid hsl(var(--border, 214 32% 91%))",
        borderRadius: 8,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {error ? (
        <div
          style={{
            color: "hsl(var(--destructive, 0 72% 51%))",
            fontSize: 12,
            fontFamily: "monospace",
            padding: 8,
            maxWidth: "100%",
            overflow: "auto",
          }}
        >
          {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{ maxWidth: "100%", overflow: "auto" }}
        />
      )}
    </div>
  );
}

// ── ShapeUtil ────────────────────────────────────────────────────────────────
export class MermaidShapeUtil extends ShapeUtil<AiMermaidShape> {
  static override type = AI_MERMAID_TYPE;

  static override props: RecordProps<AiMermaidShape> = {
    code: T.string,
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): AiMermaidShape["props"] {
    return {
      code: "flowchart LR\n  A --> B",
      w: DEFAULT_SHAPE_WIDTH,
      h: DEFAULT_SHAPE_HEIGHT,
    };
  }

  override getGeometry(shape: AiMermaidShape): Geometry2d {
    return new Rectangle2d({
      width: Math.max(shape.props.w, MIN_WIDTH),
      height: Math.max(shape.props.h, MIN_HEIGHT),
      isFilled: true,
    });
  }

  override component(shape: AiMermaidShape) {
    return (
      <HTMLContainer>
        <MermaidRenderer
          code={shape.props.code}
          w={shape.props.w}
          h={shape.props.h}
        />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: AiMermaidShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override canResize() {
    return true;
  }

  override onResize(shape: AiMermaidShape, info: TLResizeInfo<AiMermaidShape>) {
    return resizeBox(shape, info);
  }
}
