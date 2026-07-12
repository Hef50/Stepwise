/**
 * Utilities for finding mathematical equations in assistant message text:
 *
 *  - LaTeX-delimited spans: $…$  $$…$$  \(…\)  \[…\]  ```math … ``` / ```latex … ```
 *  - Prose lines that contain an equals sign and recognisable math symbols/words
 *
 * Two public entry-points:
 *
 *  segmentTextWithEquations  — splits a full text into text / equation segments
 *                              (used by MessageRenderer for the equation card UI)
 *
 *  extractNewEquations       — returns only *complete* equations not yet in `seen`
 *                              (used by ChatPanel during streaming to render on canvas)
 */

export interface TextSegment {
  type: "text";
  content: string;
}

export interface EquationSegment {
  type: "equation";
  latex: string;
}

export type MessageSegment = TextSegment | EquationSegment;

// ─── Regexes ──────────────────────────────────────────────────────────────────

/** $$ ... $$ — display math */
const RE_DISPLAY_DOLLAR = /\$\$([\s\S]+?)\$\$/g;
/** \[ ... \] — display math */
const RE_DISPLAY_BRACKET = /\\\[([\s\S]+?)\\\]/g;
/** $ ... $ — inline math (no nested $ or newlines) */
const RE_INLINE_DOLLAR = /\$([^$\n]+?)\$/g;
/** \( ... \) — inline math */
const RE_INLINE_PAREN = /\\\(([\s\S]+?)\\\)/g;
/** ```math … ``` or ```latex … ``` */
const RE_FENCED = /```(?:math|latex)\n([\s\S]+?)```/g;

/** Set of Unicode math symbols — used instead of a regex to avoid browser compatibility issues. */
const MATH_SYMBOL_SET = new Set([
  ..."∑∫∂√∇∆∞≈≠≤≥→←⟹⟺±×÷′″αβγδεζηθιλμνξπρστυφχψωΑΒΓΔΕΖΗΘΙΛΜΝΞΠΡΣΤΥΦΧΨΩ∀∃∈∉⊂⊃∪∩",
]);

/** Identifiers for common math functions that indicate a prose equation. */
const MATH_WORD_RE = /\b(?:lim|limsup|liminf|sup|inf|sinh|cosh|tanh|sin|cos|tan|log|ln|exp)\b/;

/** A prose line that looks like an equation: must contain = and at least one math indicator. */
function isProseMathLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return false;
  if (!t.includes("=")) return false;
  // Quick check: does the line contain any recognised math symbol?
  for (const ch of t) {
    if (MATH_SYMBOL_SET.has(ch)) return true;
  }
  return MATH_WORD_RE.test(t);
}

// ─── Internal match finder ────────────────────────────────────────────────────

interface MatchSpan {
  start: number;
  end: number;
  latex: string;
}

/**
 * Finds all delimited and prose equation spans in `text`.
 * Returns them sorted by start position with overlaps removed.
 */
function findAllEquationSpans(text: string): MatchSpan[] {
  const spans: MatchSpan[] = [];

  // Regex-delimited math
  for (const re of [
    RE_DISPLAY_DOLLAR,
    RE_DISPLAY_BRACKET,
    RE_INLINE_DOLLAR,
    RE_INLINE_PAREN,
    RE_FENCED,
  ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const latex = (m[1] ?? "").trim();
      if (latex) {
        spans.push({ start: m.index, end: m.index + m[0].length, latex });
      }
    }
  }

  // Prose math lines — iterate line-by-line to track positions
  let pos = 0;
  for (const line of text.split("\n")) {
    if (isProseMathLine(line)) {
      const latex = line.trim();
      // Avoid double-counting lines that are already covered by delimited math
      spans.push({ start: pos, end: pos + line.length, latex });
    }
    pos += line.length + 1; // +1 for the consumed \n
  }

  // Sort by start position
  spans.sort((a, b) => a.start - b.start);

  // Remove overlapping spans (keep the earliest starting one)
  const deduped: MatchSpan[] = [];
  let lastEnd = 0;
  for (const span of spans) {
    if (span.start >= lastEnd && span.latex.length > 0) {
      deduped.push(span);
      lastEnd = span.end;
    }
  }

  return deduped;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Splits `text` into alternating text / equation segments suitable for
 * rendering equation cards inline with prose in the chat UI.
 */
export function segmentTextWithEquations(text: string): MessageSegment[] {
  const spans = findAllEquationSpans(text);

  if (spans.length === 0) {
    return [{ type: "text", content: text }];
  }

  const segments: MessageSegment[] = [];
  let pos = 0;

  for (const span of spans) {
    if (span.start > pos) {
      const content = text.slice(pos, span.start);
      if (content.trim()) segments.push({ type: "text", content });
    }
    segments.push({ type: "equation", latex: span.latex });
    pos = span.end;
  }

  if (pos < text.length) {
    const content = text.slice(pos);
    if (content.trim()) segments.push({ type: "text", content });
  }

  return segments;
}

/**
 * Extracts equations that are complete (have their closing delimiter, or are
 * complete prose lines ending with `\n`) and have not been seen before.
 *
 * Mutates `seen` by adding newly found equations.
 * Returns the array of new LaTeX strings to render on the canvas.
 */
export function extractNewEquations(
  text: string,
  seen: Set<string>
): string[] {
  // For prose math detection, only consider lines that are complete (end with \n)
  // For delimited math, closable spans within the text count as complete
  const result: string[] = [];

  // Find all spans; prose math already requires line-completeness implicitly
  // because we split on \n. To be safe, only process up to the last newline
  // so mid-line partial content is never emitted.
  const safeText = text.includes("\n")
    ? text.slice(0, text.lastIndexOf("\n") + 1)
    : "";

  // Delimited math is complete whenever the closing delimiter is present
  const spans = findAllEquationSpans(safeText || text);

  for (const { latex } of spans) {
    const key = latex.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(latex);
    }
  }

  return result;
}
