import type { Editor } from "@tldraw/tldraw";
import { createShapeId } from "@tldraw/tldraw";
import type { WhiteboardShapeInstruction } from "@/lib/types";
import {
  AI_TEXT_TYPE,
  AI_LATEX_TYPE,
  AI_MERMAID_TYPE,
  AI_SCHEMDRAW_TYPE,
} from "@/components/whiteboard/shapes";

const DEFAULT_W = 400;
const AUTO_PLACE_MARGIN = 40;

/** Estimate the display height of a text shape given its content and width. */
function estimateTextHeight(text: string, w: number): number {
  const avgCharsPerLine = Math.floor(w / 8.5); // ~8.5px per char at 14px font
  const lineCount = text.split("\n").reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil((line.length || 1) / avgCharsPerLine));
  }, 0);
  // 22px per line + 32px padding; clamp between 80 and 500
  return Math.min(Math.max(lineCount * 22 + 32, 80), 500);
}

// Initial placement heights — deliberately generous so nothing is clipped on
// first render. useAutoSize on each shape will shrink (or grow) them to fit
// actual content, leaving visual gaps between shapes rather than overlaps.
const DEFAULT_H: Record<string, number> = {
  text: 200,
  latex: 100,
  mermaid: 600, // large diagrams (e.g. Krebs cycle) need room before auto-size fires
  schemdraw: 320,
};

/**
 * Places one or more AI-authored shapes on the tldraw canvas.
 * Auto-stacks vertically if x/y are omitted.
 */
export function createAiShapes(
  editor: Editor,
  instructions: WhiteboardShapeInstruction[]
): void {
  if (instructions.length === 0) return;

  // Compute a starting position below all existing shapes.
  const existingBounds = editor.getCurrentPageBounds();
  const viewport = editor.getViewportPageBounds();
  const baseY = existingBounds
    ? existingBounds.maxY + AUTO_PLACE_MARGIN
    : viewport.y + AUTO_PLACE_MARGIN;
  const baseX = existingBounds
    ? existingBounds.minX
    : viewport.x + AUTO_PLACE_MARGIN;

  let cursorY = 0; // vertical stacking offset within this batch

  for (const inst of instructions) {
    const w = inst.width ?? DEFAULT_W;
    const h =
      inst.kind === "text"
        ? estimateTextHeight(inst.content, w)
        : inst.height ?? DEFAULT_H[inst.kind] ?? 200;

    const x = inst.x ?? baseX;
    const y = inst.y ?? baseY + cursorY;
    cursorY += h + AUTO_PLACE_MARGIN;

    const id = createShapeId();

    switch (inst.kind) {
      case "text":
        editor.createShape({
          id,
          type: AI_TEXT_TYPE,
          x,
          y,
          props: { text: inst.content, w, h },
        });
        break;

      case "latex":
        editor.createShape({
          id,
          type: AI_LATEX_TYPE,
          x,
          y,
          props: { latex: inst.content, w, h: 80, displayMode: "block" as const },
        });
        break;

      case "mermaid":
        editor.createShape({
          id,
          type: AI_MERMAID_TYPE,
          x,
          y,
          props: { code: inst.content, w, h },
        });
        break;

      case "schemdraw":
        editor.createShape({
          id,
          type: AI_SCHEMDRAW_TYPE,
          x,
          y,
          props: { code: inst.content, w, h },
        });
        break;
    }
  }
}
