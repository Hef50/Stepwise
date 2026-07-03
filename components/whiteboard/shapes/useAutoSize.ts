"use client";

import { useEffect, type RefObject } from "react";
import { useEditor, type TLShapeId, type Editor } from "@tldraw/tldraw";

// Typed alias for updateShape's first parameter — avoids `any` while bypassing
// the discriminated union that TypeScript cannot narrow from a generic TLShapeId.
type AnyShapePartial = Parameters<Editor["updateShape"]>[0];

interface AutoSizeOptions {
  /** Extra horizontal padding added to the measured content width. */
  padX?: number;
  /** Extra vertical padding added to the measured content height. */
  padY?: number;
  /** When true the shape width also tracks content (clamped to maxWidth). */
  autoWidth?: boolean;
  /** Upper bound for auto width. */
  maxWidth?: number;
  /** Minimum height so tiny content still has a sensible box. */
  minHeight?: number;
}

/**
 * Observes a content element and keeps the owning custom shape's geometry
 * (props.w / props.h) in sync with the rendered content size. This makes the
 * shape's hit-box and bounds match what the user actually sees, which:
 *   - prevents large diagrams from being clipped to a sliver, and
 *   - lets the reflow pass stack shapes without overlap.
 */
export function useAutoSize(
  shapeId: TLShapeId,
  ref: RefObject<HTMLElement | null>,
  options: AutoSizeOptions = {}
): void {
  const editor = useEditor();
  const { padX = 0, padY = 0, autoWidth = false, maxWidth = 900, minHeight = 40 } =
    options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const shape = editor.getShape(shapeId);
      if (!shape) return;
      const props = shape.props as { w: number; h: number };

      const measuredH = Math.max(Math.ceil(el.scrollHeight) + padY, minHeight);
      const nextH = measuredH;
      const nextW = autoWidth
        ? Math.min(Math.ceil(el.scrollWidth) + padX, maxWidth)
        : props.w;

      if (Math.abs(props.h - nextH) > 2 || Math.abs(props.w - nextW) > 2) {
        editor.updateShape({
          id: shapeId,
          type: shape.type,
          props: { ...props, w: nextW, h: nextH },
        } as AnyShapePartial);
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Measure once after mount in case the observer misses the first paint.
    const raf = requestAnimationFrame(measure);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeId, editor]);
}
