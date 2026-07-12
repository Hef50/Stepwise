"use client";

import { useCallback } from "react";
import { createShapeId, type Editor, type TLShapeId } from "@tldraw/tldraw";
import { AI_LATEX_ANIMATED_TYPE } from "@/components/whiteboard/shapes/LatexAnimatedShapeUtil";
import {
  parseSvgPaths,
  estimateShapeDimensions,
  MAX_ANIMATED_PATHS,
} from "@/lib/whiteboard/latexToSvgPaths";

export interface UseWhiteboardMathReturn {
  /**
   * Convert a LaTeX string to SVG paths via the server API, then place a
   * LatexAnimatedShape on the tldraw canvas below any existing content.
   * Returns the created shape's id, or null on failure.
   */
  renderLatex: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /** Pan + zoom the tldraw camera to focus on the shape with the given id. */
  focusLatexShape: (shapeId: string) => void;
}

export function useWhiteboardMath(
  editorRef: React.RefObject<Editor | null>
): UseWhiteboardMathReturn {
  const renderLatex = useCallback(
    async (latex: string, displayMode = true): Promise<string | null> => {
      const editor = editorRef.current;
      if (!editor) {
        console.warn("[useWhiteboardMath] editor not ready, skipping render");
        return null;
      }

      let svgString: string;
      try {
        const res = await fetch("/api/latex/svg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latex, displayMode }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            err.error ?? `HTTP ${res.status} from /api/latex/svg`
          );
        }

        const json = (await res.json()) as { svg?: string };
        if (!json.svg) throw new Error("Empty SVG response from /api/latex/svg");
        svgString = json.svg;
      } catch (err) {
        console.error("[useWhiteboardMath] SVG fetch failed:", err);
        return null;
      }

      let paths: ReturnType<typeof parseSvgPaths>["paths"];
      let viewBox: string;
      try {
        const parsed = parseSvgPaths(svgString);
        paths = parsed.paths;
        viewBox = parsed.viewBox;
      } catch (err) {
        console.error("[useWhiteboardMath] SVG parse failed:", err);
        return null;
      }

      const cappedPaths = paths.slice(0, MAX_ANIMATED_PATHS);
      const { w, h } = estimateShapeDimensions(viewBox);

      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      const id = createShapeId();
      try {
        editor.createShape({
          id,
          type: AI_LATEX_ANIMATED_TYPE,
          x,
          y,
          props: {
            latex,
            svgPaths: cappedPaths,
            viewBox,
            w,
            h,
          },
        });
        return id;
      } catch (err) {
        console.error("[useWhiteboardMath] createShape failed:", err);
        return null;
      }
    },
    [editorRef]
  );

  const focusLatexShape = useCallback(
    (shapeId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const shape = editor.getShape(shapeId as TLShapeId);
        if (!shape) return;
        editor.select(shapeId as TLShapeId);
        editor.zoomToSelection({ animation: { duration: 400 } });
      } catch (err) {
        console.warn("[useWhiteboardMath] focusLatexShape failed:", err);
      }
    },
    [editorRef]
  );

  return { renderLatex, focusLatexShape };
}
