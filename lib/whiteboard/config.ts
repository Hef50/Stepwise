/**
 * Shared configuration for AI-to-whiteboard placement behaviour.
 * Kept in its own module so thresholds can be tuned in one place.
 */

/**
 * Minimum number of words a text fragment must contain before it is allowed
 * onto the whiteboard. Prevents short labels, stray LaTeX, and code fragments
 * from cluttering the canvas.
 */
export const MIN_WHITEBOARD_TEXT_WORDS = 15;

/** Hard cap on characters placed in a single whiteboard text shape. */
export const MAX_WHITEBOARD_TEXT_CHARS = 600;

/** Counts words in a string (whitespace-delimited, ignoring empties). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Strips raw LaTeX delimiters and math markup that the tutor sometimes leaves
 * inline in prose (e.g. "\\[", "\\]", "\\(", "\\)"). These render as noise on a
 * plain-text shape, so we remove the delimiters while keeping surrounding prose.
 */
export function stripLatexArtifacts(text: string): string {
  return text
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "") // \[ \] \( \)
    .replace(/\$\$?/g, "") // $ and $$
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Returns true if a line/paragraph looks like raw LaTeX or code rather than
 * readable prose (mostly backslash commands, braces, or math operators).
 */
export function looksLikeRawMath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // Dominated by LaTeX commands / braces / math symbols
  const mathChars = (trimmed.match(/[\\{}^_=]|\\[a-zA-Z]+/g) ?? []).length;
  return mathChars > 0 && mathChars / trimmed.length > 0.15;
}
