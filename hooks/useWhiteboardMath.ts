"use client";

import { useCallback } from "react";
import type { Editor } from "@tldraw/tldraw";
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
   * Fire-and-forget: rejections are caught and logged.
   */
  renderLatex: (latex: string, displayMode?: boolean) => Promise<void>;
}

export function useWhiteboardMath(
  editorRef: React.RefObject<Editor | null>
): UseWhiteboardMathReturn {
  const renderLatex = useCallback(
    async (latex: string, displayMode = true): Promise<void> => {
      const editor = editorRef.current;
      if (!editor) {
        console.warn("[useWhiteboardMath] editor not ready, skipping render");
        return;
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
        return;
      }

      let paths: ReturnType<typeof parseSvgPaths>["paths"];
      let viewBox: string;
      try {
        const parsed = parseSvgPaths(svgString);
        paths = parsed.paths;
        viewBox = parsed.viewBox;
      } catch (err) {
        console.error("[useWhiteboardMath] SVG parse failed:", err);
        return;
      }

      // Cap paths to prevent degenerate animations
      const cappedPaths = paths.slice(0, MAX_ANIMATED_PATHS);

      const { w, h } = estimateShapeDimensions(viewBox);

      // Place the shape below all existing content on the page
      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      try {
        editor.createShape({
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
      } catch (err) {
        console.error("[useWhiteboardMath] createShape failed:", err);
      }
    },
    [editorRef]
  );

  return { renderLatex };
}
