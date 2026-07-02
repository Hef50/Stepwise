import type { MessageBlock, DiagramType, WhiteboardShapeInstruction, WhiteboardShapeKind } from "@/lib/types";

const FENCE_PATTERN = /```(mermaid|schemdraw|whiteboard)\n([\s\S]*?)```/g;

/**
 * Splits an assistant message into alternating text and diagram blocks.
 * Diagram blocks are extracted from fenced code blocks tagged `mermaid`,
 * `schemdraw`, or `whiteboard` (AI-to-canvas instructions).
 */
export function parseMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let lastIndex = 0;

  FENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FENCE_PATTERN.exec(content)) !== null) {
    const [fullMatch, lang, code] = match;
    const matchStart = match.index;

    // Text before this fence
    if (matchStart > lastIndex) {
      const text = content.slice(lastIndex, matchStart).trim();
      if (text) {
        blocks.push({ kind: "text", content: text });
      }
    }

    if (lang === "whiteboard") {
      // Whiteboard blocks are handled separately by parseWhiteboardInstructions
      // and are intentionally not rendered in the chat bubble.
    } else {
      blocks.push({
        kind: "diagram",
        diagramType: lang as DiagramType,
        code: code.trim(),
      });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // Remaining text after last fence
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) {
      blocks.push({ kind: "text", content: text });
    }
  }

  // If no fences found, return the whole content as a single text block
  if (blocks.length === 0) {
    blocks.push({ kind: "text", content });
  }

  return blocks;
}

/**
 * Extracts all ```whiteboard … ``` blocks from an assistant message and
 * parses each as a WhiteboardShapeInstruction JSON object.
 * Invalid JSON entries are silently skipped.
 */
export function parseWhiteboardInstructions(
  content: string
): WhiteboardShapeInstruction[] {
  const instructions: WhiteboardShapeInstruction[] = [];
  const pattern = /```whiteboard\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(content)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "kind" in parsed &&
        "content" in parsed &&
        typeof (parsed as { kind: unknown }).kind === "string" &&
        typeof (parsed as { content: unknown }).content === "string"
      ) {
        const { kind, content: shapeContent, x, y, width } = parsed as {
          kind: WhiteboardShapeKind;
          content: string;
          x?: number;
          y?: number;
          width?: number;
        };
        instructions.push({ kind, content: shapeContent, x, y, width });
      }
    } catch {
      // Skip malformed blocks
    }
  }

  return instructions;
}
