import type { MessageBlock, DiagramType } from "@/lib/types";

const FENCE_PATTERN = /```(mermaid|schemdraw)\n([\s\S]*?)```/g;

/**
 * Splits an assistant message into alternating text and diagram blocks.
 * Diagram blocks are extracted from fenced code blocks tagged `mermaid` or `schemdraw`.
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

    blocks.push({
      kind: "diagram",
      diagramType: lang as DiagramType,
      code: code.trim(),
    });

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
