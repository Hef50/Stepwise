/**
 * Utilities for finding whiteboard text markers in assistant message text:
 *
 *   [[board: Quadratic formula]]
 *
 * Used as the LLM7 (no-tools) fallback — Gemma uses render_text_whiteboard.
 */

const RE_BOARD = /\[\[\s*board:\s*([^\]]+?)\]\]/gi;

/** Max words allowed on the whiteboard (labels / key terms, not sentences). */
export const MAX_BOARD_TEXT_WORDS = 8;

export function isBoardTextWorthy(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 1 || t.length > 80) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_BOARD_TEXT_WORDS) return false;
  return true;
}

/**
 * Extracts new [[board:...]] labels that are complete and not yet in `seen`.
 * Mutates `seen` by adding newly found labels.
 */
export function extractNewBoardText(
  text: string,
  seen: Set<string>
): string[] {
  const result: string[] = [];
  RE_BOARD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_BOARD.exec(text)) !== null) {
    const label = (m[1] ?? "").trim().replace(/\s+/g, " ");
    if (!label || !isBoardTextWorthy(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

/** Remove all complete [[board:...]] markers from displayed chat text. */
export function stripBoardMarkers(text: string): string {
  return text.replace(RE_BOARD, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Truncates `text` so an incomplete `[[board:` opener never appears in chat.
 * Everything from the unclosed opener onward is hidden.
 */
export function stripIncompleteBoardMarker(text: string): string {
  const lower = text.toLowerCase();
  let from = 0;
  let cut = text.length;

  while (from < text.length) {
    const start = lower.indexOf("[[board:", from);
    if (start === -1) break;
    const afterOpen = start + "[[board:".length;
    const end = text.indexOf("]]", afterOpen);
    if (end === -1) {
      cut = Math.min(cut, start);
      break;
    }
    from = end + 2;
  }

  // Also catch partial openers like "[[" or "[[board"
  const partials = ["[[board:", "[[board", "[[b", "[["];
  for (const p of partials) {
    if (text.length >= p.length && text.toLowerCase().endsWith(p)) {
      cut = Math.min(cut, text.length - p.length);
    }
  }

  return text.slice(0, cut);
}

/**
 * Strip both incomplete and complete board markers for chat display.
 */
export function sanitizeBoardTextForDisplay(text: string): string {
  return stripBoardMarkers(stripIncompleteBoardMarker(text));
}
