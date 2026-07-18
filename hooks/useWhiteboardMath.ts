"use client";

import { useCallback, useState } from "react";
import { createShapeId, type Editor, type TLShapeId } from "@tldraw/tldraw";
import { AI_LATEX_ANIMATED_TYPE } from "@/components/whiteboard/shapes/LatexAnimatedShapeUtil";
import { AI_TEXT_ANIMATED_TYPE } from "@/components/whiteboard/shapes/TextAnimatedShapeUtil";
import { AI_DIAGRAM_ANIMATED_TYPE } from "@/components/whiteboard/shapes/DiagramAnimatedShapeUtil";
import {
  parseSvgPaths,
  estimateShapeDimensions,
  MAX_ANIMATED_PATHS,
} from "@/lib/whiteboard/latexToSvgPaths";
import {
  textToSvgPaths,
  estimateTextShapeDimensions,
} from "@/lib/whiteboard/textToSvgPaths";
import {
  diagramToSvgPaths,
  estimateDiagramShapeDimensions,
} from "@/lib/whiteboard/diagramToSvgPaths";
import { resolveDiagramPrimitives } from "@/lib/whiteboard/diagramLayout";
import {
  diagramSpecKey,
  parseDiagramSpec,
  type DiagramSpec,
} from "@/lib/whiteboard/diagramSpec";
import {
  loadLatexFontSize,
  saveLatexFontSize,
} from "@/lib/whiteboard/latexFontSize";
import {
  loadWbTextSize,
  saveWbTextSize,
  loadWbTextColor,
  saveWbTextColor,
  loadWbTextMode,
  saveWbTextMode,
  type WhiteboardTextMode,
} from "@/lib/whiteboard/textStyle";
import {
  loadWbDiagramStyle,
  saveWbDiagramStyle,
  loadWbDiagramColor,
  saveWbDiagramColor,
  type DiagramStyle,
} from "@/lib/whiteboard/diagramStyle";
import {
  computeDrawStepMs,
} from "@/lib/chat/textReveal";
import { getDrawSpeed } from "@/lib/chat/drawSpeeds";
import {
  waitForLatexAnimation,
  notifyLatexAnimationComplete,
  cancelLatexAnimationWait,
} from "@/lib/whiteboard/latexAnimationBridge";

export const WHITEBOARD_PERSISTENCE_KEY = "stepwise-whiteboard";

export interface RenderTextOptions {
  mode?: WhiteboardTextMode;
  color?: string;
}

export interface UseWhiteboardMathReturn {
  /**
   * Convert a LaTeX string to SVG paths via the server API, then place a
   * LatexAnimatedShape on the tldraw canvas below any existing content.
   * Returns the created shape's id, or null on failure.
   */
  renderLatex: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /**
   * Convert plain text to handwritten SVG paths via opentype.js, then place a
   * TextAnimatedShape on the canvas. Returns the created shape's id, or null.
   */
  renderText: (
    text: string,
    options?: RenderTextOptions
  ) => Promise<string | null>;
  /**
   * Compile a DiagramSpec to stroke paths and place an animated diagram shape.
   * Accepts a parsed DiagramSpec or a JSON string. Returns shape id or null.
   */
  renderDiagram: (
    specOrJson: DiagramSpec | string
  ) => Promise<string | null>;
  /** Pan + zoom the tldraw camera to focus on the shape with the given id. */
  focusLatexShape: (shapeId: string) => void;
  /** Current on-canvas LaTeX font size (px ≈ 1em). */
  latexFontSize: number;
  /** Persist a new font size and rescale every existing LaTeX shape. */
  setLatexFontSize: (size: number) => void;
  /** Current on-canvas handwritten text size (px). */
  wbTextSize: number;
  setWbTextSize: (size: number) => void;
  /** Color baked into new text shapes. */
  wbTextColor: string;
  setWbTextColor: (color: string) => void;
  /** stroke = single-line pen; outline = filled handwriting font. */
  wbTextMode: WhiteboardTextMode;
  setWbTextMode: (mode: WhiteboardTextMode) => void;
  /** sketchy = rough.js; clean = precise geometry — baked into new diagrams. */
  wbDiagramStyle: DiagramStyle;
  setWbDiagramStyle: (style: DiagramStyle) => void;
  /** Default stroke color for new diagrams. */
  wbDiagramColor: string;
  setWbDiagramColor: (color: string) => void;
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

function findExistingTextShape(
  editor: Editor,
  text: string
): TLShapeId | null {
  const key = text.trim().toLowerCase();
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== AI_TEXT_ANIMATED_TYPE) continue;
    const props = shape.props as { text?: string };
    if (
      typeof props.text === "string" &&
      props.text.trim().toLowerCase() === key
    ) {
      return shape.id;
    }
  }
  return null;
}

function findExistingDiagramShape(
  editor: Editor,
  key: string
): TLShapeId | null {
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== AI_DIAGRAM_ANIMATED_TYPE) continue;
    const props = shape.props as { specKey?: string };
    if (typeof props.specKey === "string" && props.specKey === key) {
      return shape.id;
    }
  }
  return null;
}

export function useWhiteboardMath(
  editorRef: React.RefObject<Editor | null>
): UseWhiteboardMathReturn {
  const [latexFontSize, setLatexFontSizeState] = useState(loadLatexFontSize);
  const [wbTextSize, setWbTextSizeState] = useState(loadWbTextSize);
  const [wbTextColor, setWbTextColorState] = useState(loadWbTextColor);
  const [wbTextMode, setWbTextModeState] = useState(loadWbTextMode);
  const [wbDiagramStyle, setWbDiagramStyleState] = useState(loadWbDiagramStyle);
  const [wbDiagramColor, setWbDiagramColorState] = useState(loadWbDiagramColor);

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

  const setWbTextSize = useCallback(
    (size: number) => {
      saveWbTextSize(size);
      setWbTextSizeState(size);

      const editor = editorRef.current;
      if (!editor) return;

      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type !== AI_TEXT_ANIMATED_TYPE) continue;
        const props = shape.props as {
          viewBox: string;
          fontSize: number;
        };
        const creationSize =
          typeof props.fontSize === "number" && props.fontSize > 0
            ? props.fontSize
            : size;
        const { w: baseW, h: baseH } = estimateTextShapeDimensions(
          props.viewBox
        );
        const scale = size / creationSize;
        editor.updateShape({
          id: shape.id,
          type: AI_TEXT_ANIMATED_TYPE,
          props: {
            w: Math.max(Math.ceil(baseW * scale), 24),
            h: Math.max(Math.ceil(baseH * scale), 24),
          },
        });
      }
    },
    [editorRef]
  );

  const setWbTextColor = useCallback((color: string) => {
    saveWbTextColor(color);
    setWbTextColorState(color);
  }, []);

  const setWbTextMode = useCallback((mode: WhiteboardTextMode) => {
    saveWbTextMode(mode);
    setWbTextModeState(mode);
  }, []);

  const setWbDiagramStyle = useCallback((style: DiagramStyle) => {
    saveWbDiagramStyle(style);
    setWbDiagramStyleState(style);
  }, []);

  const setWbDiagramColor = useCallback((color: string) => {
    saveWbDiagramColor(color);
    setWbDiagramColorState(color);
  }, []);

  const renderLatex = useCallback(
    async (latex: string, displayMode = true): Promise<string | null> => {
      const editor = editorRef.current;
      if (!editor) {
        return null;
      }

      const existingId = findExistingLatexShape(editor, latex);
      if (existingId) {
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
      const stepMs =
        computeDrawStepMs(
          getDrawSpeed("latex"),
          cappedPaths.length,
          { contentLength: latex.trim().length, kind: "latex" }
        ) ?? 0;

      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      const id = createShapeId();
      try {
        const settleBudget =
          stepMs > 0 ? cappedPaths.length * stepMs + 2500 : 0;
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

  const renderText = useCallback(
    async (
      text: string,
      options?: RenderTextOptions
    ): Promise<string | null> => {
      const editor = editorRef.current;
      if (!editor) return null;

      const trimmed = text.trim().replace(/\s+/g, " ");
      if (!trimmed) return null;

      const existingId = findExistingTextShape(editor, trimmed);
      if (existingId) {
        notifyLatexAnimationComplete(existingId);
        return existingId;
      }

      const mode = options?.mode ?? wbTextMode;
      const color = options?.color ?? wbTextColor;

      let paths: Awaited<ReturnType<typeof textToSvgPaths>>["paths"];
      let viewBox: string;
      try {
        const parsed = await textToSvgPaths(trimmed, mode, wbTextSize);
        paths = parsed.paths;
        viewBox = parsed.viewBox;
      } catch (err) {
        console.error("[useWhiteboardMath] textToSvgPaths failed:", err);
        return null;
      }

      const { w, h } = estimateTextShapeDimensions(viewBox);
      const stepMs =
        computeDrawStepMs(
          getDrawSpeed("text"),
          Math.max(paths.length, 1),
          { contentLength: trimmed.length, kind: "text" }
        ) ?? 0;

      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      const id = createShapeId();
      try {
        const settleBudget =
          stepMs > 0 ? paths.length * stepMs + 2500 : 0;
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
          type: AI_TEXT_ANIMATED_TYPE,
          x,
          y,
          props: {
            text: trimmed,
            svgPaths: paths,
            viewBox,
            w,
            h,
            animate: stepMs > 0,
            stepMs,
            mode,
            color,
            fontSize: wbTextSize,
          },
        });

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

        await animationDone;
        return id;
      } catch (err) {
        cancelLatexAnimationWait(id);
        console.error("[useWhiteboardMath] createTextShape failed:", err);
        return null;
      }
    },
    [editorRef, wbTextSize, wbTextColor, wbTextMode]
  );

  const renderDiagram = useCallback(
    async (specOrJson: DiagramSpec | string): Promise<string | null> => {
      const editor = editorRef.current;
      if (!editor) return null;

      let spec: DiagramSpec | null;
      if (typeof specOrJson === "string") {
        try {
          const parsed: unknown = JSON.parse(specOrJson);
          spec = parseDiagramSpec(parsed);
        } catch {
          console.error("[useWhiteboardMath] diagram JSON parse failed");
          return null;
        }
      } else {
        spec = parseDiagramSpec(specOrJson);
      }
      if (!spec) {
        console.error("[useWhiteboardMath] invalid diagram spec");
        return null;
      }

      const key = diagramSpecKey(spec);
      const existingId = findExistingDiagramShape(editor, key);
      if (existingId) {
        notifyLatexAnimationComplete(existingId);
        return existingId;
      }

      let paths: Awaited<ReturnType<typeof diagramToSvgPaths>>["paths"];
      let viewBox: string;
      try {
        const primitives = resolveDiagramPrimitives(spec);
        const compiled = await diagramToSvgPaths(primitives, {
          style: wbDiagramStyle,
          color: wbDiagramColor,
          textMode: wbTextMode,
        });
        paths = compiled.paths;
        viewBox = compiled.viewBox;
      } catch (err) {
        console.error("[useWhiteboardMath] diagramToSvgPaths failed:", err);
        return null;
      }

      if (paths.length === 0) {
        console.error("[useWhiteboardMath] diagram produced no paths");
        return null;
      }

      const { w, h } = estimateDiagramShapeDimensions(viewBox);
      const timingKey = spec.title ?? key.slice(0, 48);
      const shapeCount = Math.max(
        1,
        paths.filter((p) => p.role !== "label").length
      );
      const labelCount = Math.max(
        1,
        paths.filter((p) => p.role === "label").length
      );
      const shapeStepMs =
        computeDrawStepMs(getDrawSpeed("diagram"), shapeCount, {
          contentLength: timingKey.length,
          kind: "diagram",
        }) ?? 0;
      const labelStepMs =
        computeDrawStepMs(getDrawSpeed("text"), labelCount, {
          contentLength: timingKey.length,
          kind: "text",
        }) ?? 0;

      const existingBounds = editor.getCurrentPageBounds();
      const x = 60;
      const y = existingBounds ? existingBounds.maxY + 40 : 100;

      const id = createShapeId();
      try {
        const shouldAnimate = shapeStepMs > 0 || labelStepMs > 0;
        const totalDrawMs = shouldAnimate
          ? paths.reduce((sum, p) => {
              const ms = p.role === "label" ? labelStepMs : shapeStepMs;
              return sum + Math.max(1, ms);
            }, 0)
          : 0;
        const settleBudget = shouldAnimate ? totalDrawMs + 2500 : 0;
        const animationDone = shouldAnimate
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
          type: AI_DIAGRAM_ANIMATED_TYPE,
          x,
          y,
          props: {
            specKey: key,
            title: spec.title ?? "",
            svgPaths: paths,
            viewBox,
            w,
            h,
            animate: shouldAnimate,
            stepMs: shapeStepMs,
            shapeStepMs,
            labelStepMs,
            style: wbDiagramStyle,
            color: wbDiagramColor,
          },
        });

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

        await animationDone;
        return id;
      } catch (err) {
        cancelLatexAnimationWait(id);
        console.error("[useWhiteboardMath] createDiagramShape failed:", err);
        return null;
      }
    },
    [editorRef, wbDiagramStyle, wbDiagramColor, wbTextMode]
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

    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(
          `TLDRAW_DOCUMENT_v2${WHITEBOARD_PERSISTENCE_KEY}`
        );
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
    renderText,
    renderDiagram,
    focusLatexShape,
    latexFontSize,
    setLatexFontSize,
    wbTextSize,
    setWbTextSize,
    wbTextColor,
    setWbTextColor,
    wbTextMode,
    setWbTextMode,
    wbDiagramStyle,
    setWbDiagramStyle,
    wbDiagramColor,
    setWbDiagramColor,
    clearWhiteboard,
  };
}
