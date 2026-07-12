"use client";

import { useCallback, useState } from "react";
import { createShapeId, type Editor, type TLShapeId } from "@tldraw/tldraw";
import { AI_LATEX_ANIMATED_TYPE } from "@/components/whiteboard/shapes/LatexAnimatedShapeUtil";
import {
  parseSvgPaths,
  estimateShapeDimensions,
  MAX_ANIMATED_PATHS,
} from "@/lib/whiteboard/latexToSvgPaths";
import {
  loadLatexFontSize,
  saveLatexFontSize,
} from "@/lib/whiteboard/latexFontSize";
import {
  getSharedTextSpeed,
  computeLatexStepMs,
} from "@/lib/chat/textReveal";
import {
  waitForLatexAnimation,
  notifyLatexAnimationComplete,
  cancelLatexAnimationWait,
} from "@/lib/whiteboard/latexAnimationBridge";

export const WHITEBOARD_PERSISTENCE_KEY = "stepwise-whiteboard";

export interface UseWhiteboardMathReturn {
  /**
   * Convert a LaTeX string to SVG paths via the server API, then place a
   * LatexAnimatedShape on the tldraw canvas below any existing content.
   * Returns the created shape's id, or null on failure.
   */
  renderLatex: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /** Pan + zoom the tldraw camera to focus on the shape with the given id. */
  focusLatexShape: (shapeId: string) => void;
  /** Current on-canvas LaTeX font size (px ≈ 1em). */
  latexFontSize: number;
  /** Persist a new font size and rescale every existing LaTeX shape. */
  setLatexFontSize: (size: number) => void;
  /** Delete all shapes and wipe the persisted whiteboard document. */
  clearWhiteboard: () => Promise<void>;
}

function findExistingLatexShape(
  editor: Editor,
  latex: string
): TLShapeId | null {
  const key = latex.trim();
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== AI_LATEX_ANIMATED_TYPE) continue;
    const props = shape.props as { latex?: string };
    if (typeof props.latex === "string" && props.latex.trim() === key) {
      return shape.id;
    }
  }
  return null;
}

export function useWhiteboardMath(
  editorRef: React.RefObject<Editor | null>
): UseWhiteboardMathReturn {
  const [latexFontSize, setLatexFontSizeState] = useState(loadLatexFontSize);

  const setLatexFontSize = useCallback(
    (size: number) => {
      saveLatexFontSize(size);
      setLatexFontSizeState(size);

      const editor = editorRef.current;
      if (!editor) return;

      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== AI_LATEX_ANIMATED_TYPE) continue;
        const props = shape.props as { viewBox: string };
        const { w, h } = estimateShapeDimensions(props.viewBox, size);
        editor.updateShape({
          id: shape.id,
          type: AI_LATEX_ANIMATED_TYPE,
          props: { w, h },
        });
      }
    },
    [editorRef]
  );

  const renderLatex = useCallback(
    async (latex: string, displayMode = true): Promise<string | null> => {
      const editor = editorRef.current;
      if (!editor) {
        return null;
      }

      // Avoid duplicates after refresh (persisted board + chat re-extraction)
      const existingId = findExistingLatexShape(editor, latex);
      if (existingId) {
        // Already on the board — no animation to wait for
        notifyLatexAnimationComplete(existingId);
        return existingId;
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
      const { w, h } = estimateShapeDimensions(viewBox, latexFontSize);
      // Match wall-clock draw time to typing pace at the current slider speed
      const stepMs =
        computeLatexStepMs(
          getSharedTextSpeed(),
          latex,
          cappedPaths.length
        ) ?? 0;

      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      const id = createShapeId();
      try {
        const settleBudget =
          stepMs > 0 ? cappedPaths.length * stepMs + 2500 : 0;
        // Register waiter BEFORE createShape so a fast settle can't miss it
        const animationDone =
          stepMs > 0
            ? Promise.race([
                waitForLatexAnimation(id),
                new Promise<void>((resolve) => {
                  window.setTimeout(() => {
                    cancelLatexAnimationWait(id);
                    resolve();
                  }, settleBudget);
                }),
              ])
            : Promise.resolve();

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
            animate: stepMs > 0,
            stepMs,
          },
        });

        // Pan to center on the equation — keep the user's current zoom level
        try {
          const bounds = editor.getShapePageBounds(id);
          if (bounds) {
            editor.centerOnPoint(bounds.center, {
              animation: { duration: 280 },
            });
          }
        } catch {
          // non-fatal
        }

        // Block until this equation finishes drawing so callers can serialize
        await animationDone;
        return id;
      } catch (err) {
        cancelLatexAnimationWait(id);
        console.error("[useWhiteboardMath] createShape failed:", err);
        return null;
      }
    },
    [editorRef, latexFontSize]
  );

  const focusLatexShape = useCallback(
    (shapeId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const shape = editor.getShape(shapeId as TLShapeId);
        if (!shape) return;
        editor.select(shapeId as TLShapeId);
        const bounds = editor.getShapePageBounds(shapeId as TLShapeId);
        if (bounds) {
          // Pan only — preserve current zoom
          editor.centerOnPoint(bounds.center, {
            animation: { duration: 400 },
          });
        }
      } catch (err) {
        console.warn("[useWhiteboardMath] focusLatexShape failed:", err);
      }
    },
    [editorRef]
  );

  const clearWhiteboard = useCallback(async () => {
    const editor = editorRef.current;
    if (editor) {
      const ids = editor.getCurrentPageShapes().map((s) => s.id);
      if (ids.length > 0) editor.deleteShapes(ids);
    }

    // Wipe IndexedDB document used by tldraw persistenceKey so a reload
    // cannot resurrect the cleared board.
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(`TLDRAW_DOCUMENT_v2${WHITEBOARD_PERSISTENCE_KEY}`);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    } catch {
      // ignore — best-effort cleanup
    }
  }, [editorRef]);

  return {
    renderLatex,
    focusLatexShape,
    latexFontSize,
    setLatexFontSize,
    clearWhiteboard,
  };
}
