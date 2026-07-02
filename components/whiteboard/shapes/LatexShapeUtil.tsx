"use client";

/**
 * LatexShapeUtil — KaTeX-rendered LaTeX expression on the tldraw canvas.
 *
 * Self-contained: type def + props + ShapeUtil + React component + indicator.
 * Do NOT import from sibling shape files.
 */

import { useEffect, useRef } from "react";
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
export const AI_LATEX_TYPE = "ai-latex" as const;

export interface AiLatexProps {
  latex: string;
  w: number;
  h: number;
  /** "block" (display math) or "inline" */
  displayMode: "block" | "inline";
}

declare module "@tldraw/tldraw" {
  interface TLGlobalShapePropsMap {
    [AI_LATEX_TYPE]: AiLatexProps;
  }
}

export type AiLatexShape = TLBaseShape<typeof AI_LATEX_TYPE, AiLatexProps>;

// ── KaTeX renderer component ─────────────────────────────────────────────────
function KatexRenderer({
  latex,
  displayMode,
  w,
  h,
}: {
  latex: string;
  displayMode: boolean;
  w: number;
  h: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("katex").then(({ default: katex }) => {
      if (cancelled || !containerRef.current) return;
      try {
        katex.render(latex, containerRef.current, {
          displayMode,
          throwOnError: false,
          output: "html",
        });
      } catch {
        if (containerRef.current) {
          containerRef.current.textContent = latex;
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [latex, displayMode]);

  return (
    <div
      ref={containerRef}
      style={{
        width: w,
        minHeight: h,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: displayMode ? "center" : "flex-start",
        backgroundColor: "hsl(var(--background, 0 0% 100%))",
        border: "1.5px solid hsl(var(--primary, 221 83% 53%) / 0.4)",
        borderRadius: 8,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        overflow: "hidden",
        fontFamily: "KaTeX_Main, serif",
        fontSize: displayMode ? 18 : 14,
      }}
    />
  );
}

// ── ShapeUtil ────────────────────────────────────────────────────────────────
export class LatexShapeUtil extends ShapeUtil<AiLatexShape> {
  static override type = AI_LATEX_TYPE;

  static override props: RecordProps<AiLatexShape> = {
    latex: T.string,
    w: T.number,
    h: T.number,
    displayMode: T.literalEnum("block", "inline"),
  };

  override getDefaultProps(): AiLatexShape["props"] {
    return {
      latex: "",
      w: DEFAULT_SHAPE_WIDTH,
      h: 80,
      displayMode: "block",
    };
  }

  override getGeometry(shape: AiLatexShape): Geometry2d {
    return new Rectangle2d({
      width: Math.max(shape.props.w, MIN_WIDTH),
      height: Math.max(shape.props.h, MIN_HEIGHT),
      isFilled: true,
    });
  }

  override component(shape: AiLatexShape) {
    return (
      <HTMLContainer>
        <KatexRenderer
          latex={shape.props.latex}
          displayMode={shape.props.displayMode === "block"}
          w={shape.props.w}
          h={shape.props.h}
        />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: AiLatexShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override canResize() {
    return true;
  }

  override onResize(shape: AiLatexShape, info: TLResizeInfo<AiLatexShape>) {
    return resizeBox(shape, info);
  }
}
