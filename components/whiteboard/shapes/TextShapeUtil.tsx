"use client";

/**
 * TextShapeUtil — AI-authored plain-text annotation on the tldraw canvas.
 *
 * Self-contained: type def + props + ShapeUtil + React component + indicator.
 * Do NOT import from sibling shape files.
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
import { DEFAULT_SHAPE_WIDTH, DEFAULT_SHAPE_HEIGHT, MIN_WIDTH, MIN_HEIGHT } from "./baseShape";
import { useAutoSize } from "./useAutoSize";

// ── Renderer component ────────────────────────────────────────────────────────
function TextRenderer({
  shapeId,
  text,
  w,
}: {
  shapeId: TLShapeId;
  text: string;
  w: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  useAutoSize(shapeId, outerRef, { minHeight: 48 });

  return (
    <div
      ref={outerRef}
      style={{
        width: w,
        padding: "12px 14px",
        backgroundColor: "hsl(var(--background, 0 0% 100%))",
        border: "1.5px solid hsl(var(--border, 214 32% 91%))",
        borderRadius: 8,
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "inherit",
        color: "hsl(var(--foreground, 222 47% 11%))",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      {text}
    </div>
  );
}

// ── Type augmentation ────────────────────────────────────────────────────────
export const AI_TEXT_TYPE = "ai-text" as const;

export interface AiTextProps {
  text: string;
  w: number;
  h: number;
}

declare module "@tldraw/tldraw" {
  interface TLGlobalShapePropsMap {
    [AI_TEXT_TYPE]: AiTextProps;
  }
}

export type AiTextShape = TLBaseShape<typeof AI_TEXT_TYPE, AiTextProps>;

// ── ShapeUtil ────────────────────────────────────────────────────────────────
export class TextShapeUtil extends ShapeUtil<AiTextShape> {
  static override type = AI_TEXT_TYPE;

  static override props: RecordProps<AiTextShape> = {
    text: T.string,
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): AiTextShape["props"] {
    return {
      text: "",
      w: DEFAULT_SHAPE_WIDTH,
      h: DEFAULT_SHAPE_HEIGHT,
    };
  }

  override getGeometry(shape: AiTextShape): Geometry2d {
    return new Rectangle2d({
      width: Math.max(shape.props.w, MIN_WIDTH),
      height: Math.max(shape.props.h, MIN_HEIGHT),
      isFilled: true,
    });
  }

  override component(shape: AiTextShape) {
    return (
      <HTMLContainer>
        <TextRenderer shapeId={shape.id} text={shape.props.text} w={shape.props.w} />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: AiTextShape): Path2D {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }

  override canResize() {
    return true;
  }

  override onResize(shape: AiTextShape, info: TLResizeInfo<AiTextShape>) {
    return resizeBox(shape, info);
  }
}
