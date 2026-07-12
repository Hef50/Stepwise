/**
 * Utilities for finding mathematical equations in assistant message text:
 *
 *  - LaTeX-delimited spans: $…$  $$…$$  \(…\)  \[…\]  ```math … ``` / ```latex … ```
 *  - Prose lines that contain an equals sign and recognisable math symbols/words
 *
 * Display math ($$, \[, fenced) that is "whiteboard-worthy" is drawn on the
 * canvas. Trivial inline tokens like $x$, $h$, $f(x)$ stay as plain text in chat
 * and never go to the whiteboard.
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
const MATH_WORD_RE =
  /\b(?:lim|limsup|liminf|sup|inf|sinh|cosh|tanh|sin|cos|tan|log|ln|exp)\b/;

/** Substantial LaTeX commands that belong on the whiteboard. */
const SUBSTANTIAL_CMD_RE =
  /\\(frac|dfrac|tfrac|lim|sum|int|oint|prod|sqrt|partial|nabla|infty|cdot|times|div|over|underline|overrightarrow|hat|bar|vec|mathrm|mathbf|mathbb|mathcal)/;

/**
 * True when an equation is substantial enough to draw on the whiteboard.
 * Rejects single tokens and tiny expressions like x, h, f(x), |x|, x = 0.
 */
export function isWhiteboardWorthy(latex: string): boolean {
  const t = latex.trim().replace(/\s+/g, " ");
  if (t.length < 6) return false;

  // Pure identifier / call: x, h, f(x), f'(x), |x|
  if (/^[a-zA-Zα-ωΑ-Ω]'?$/.test(t)) return false;
  if (/^[a-zA-Z]'?\([^)]{0,10}\)$/.test(t)) return false;
  if (/^\|[^|]{1,8}\|$/.test(t)) return false;

  // Simple var = number: x = 0, n = 1
  if (/^[a-zA-Z]'?\s*=\s*-?\d+(\.\d+)?$/.test(t)) return false;

  // Absolute-value identity like f(x) = |x| — short, not worth a board draw
  if (/^[a-zA-Z]'?\([^)]{0,8}\)\s*=\s*\|[^|]{1,8}\|$/.test(t)) return false;

  // Real LaTeX structure (limits, fractions, etc.)
  if (SUBSTANTIAL_CMD_RE.test(t)) return true;

  // Non-trivial equation with =
  if (t.includes("=") && t.length >= 10) return true;

  // Longer standalone expression
  if (t.length >= 18) return true;

  return false;
}

/** A prose line that looks like an equation: must contain = and at least one math indicator. */
function isProseMathLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return false;
  if (!t.includes("=")) return false;
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
  /** display = $$ / \[ / fenced; inline = $ / \(; prose = bare line */
  kind: "display" | "inline" | "prose";
}

function findMatchingBrace(text: string, openIdx: number): number {
  if (text[openIdx] !== "{") return -1;
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++; // skip escaped char
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extends from a `\command` start index through its brace/bracket arguments.
 * Returns the end index (exclusive), or `start` if the command is incomplete.
 */
function extendLatexCommand(text: string, start: number): number {
  if (text[start] !== "\\") return start;
  let i = start + 1;
  while (i < text.length && /[a-zA-Z]/.test(text[i]!)) i++;
  const cmdEnd = i;
  if (cmdEnd === start + 1) return start;

  let consumedGroup = false;
  while (i < text.length) {
    while (i < text.length && text[i] === " ") i++;
    if (text[i] === "{") {
      const close = findMatchingBrace(text, i);
      if (close === -1) return start; // incomplete
      i = close + 1;
      consumedGroup = true;
    } else if (text[i] === "[") {
      const close = text.indexOf("]", i);
      if (close === -1) return start;
      i = close + 1;
    } else if (text[i] === "_" || text[i] === "^") {
      i++;
      if (text[i] === "{") {
        const close = findMatchingBrace(text, i);
        if (close === -1) return start;
        i = close + 1;
      } else if (i < text.length && text[i] !== " " && text[i] !== "\n") {
        i++;
      }
      consumedGroup = true;
    } else {
      break;
    }
  }

  // \frac / \dfrac need at least one brace group to be useful
  return consumedGroup ? i : start;
}

/** Find bare LaTeX commands embedded in prose (no $ delimiters), e.g. \frac{a}{b}. */
function findBareLatexCommandSpans(text: string): MatchSpan[] {
  const spans: MatchSpan[] = [];
  const cmdRe =
    /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|binom|overset|underset)\b/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(text)) !== null) {
    const start = m.index;
    const end = extendLatexCommand(text, start);
    if (end <= start) continue;
    const latex = text.slice(start, end).trim();
    if (!latex) continue;
    // Always treat fractions / substantial cmds as whiteboard display math
    spans.push({ start, end, latex, kind: "display" });
    cmdRe.lastIndex = end;
  }
  return spans;
}

function findAllEquationSpans(text: string): MatchSpan[] {
  const spans: MatchSpan[] = [];

  for (const { re, kind } of [
    { re: RE_DISPLAY_DOLLAR, kind: "display" as const },
    { re: RE_DISPLAY_BRACKET, kind: "display" as const },
    { re: RE_FENCED, kind: "display" as const },
    { re: RE_INLINE_DOLLAR, kind: "inline" as const },
    { re: RE_INLINE_PAREN, kind: "inline" as const },
  ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const latex = (m[1] ?? "").trim();
      if (latex) {
        spans.push({
          start: m.index,
          end: m.index + m[0].length,
          latex,
          kind,
        });
      }
    }
  }

  // Bare \frac{...}{...} etc. embedded in prose without $ delimiters
  spans.push(...findBareLatexCommandSpans(text));

  let pos = 0;
  for (const line of text.split("\n")) {
    if (isProseMathLine(line)) {
      spans.push({
        start: pos,
        end: pos + line.length,
        latex: line.trim(),
        kind: "prose",
      });
    }
    pos += line.length + 1;
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);

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

/**
 * Truncates `text` so incomplete math ($$, \[, ```math, or bare \frac{)
 * never appears in the chat UI — everything from the opener onward is hidden.
 */
export function stripIncompleteMathDelimiters(text: string): string {
  const openers = [
    { open: "$$", close: "$$" },
    { open: "\\[", close: "\\]" },
    { open: "```math", close: "```" },
    { open: "```latex", close: "```" },
  ];

  let cut = text.length;
  for (const { open, close } of openers) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(open, from);
      if (start === -1) break;
      const afterOpen = start + open.length;
      const end = text.indexOf(close, afterOpen);
      if (end === -1) {
        cut = Math.min(cut, start);
        break;
      }
      from = end + close.length;
    }
  }

  // Incomplete bare commands: \frac{... with no matching }
  const bareCmdRe =
    /\\(frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|binom)\b/g;
  let m: RegExpExecArray | null;
  while ((m = bareCmdRe.exec(text)) !== null) {
    const start = m.index;
    const end = extendLatexCommand(text, start);
    if (end <= start) {
      cut = Math.min(cut, start);
      break;
    }
    bareCmdRe.lastIndex = end;
  }

  if (cut === text.length && text.endsWith("$") && !text.endsWith("$$")) {
    const prev = text.slice(0, -1);
    if (!prev.endsWith("$")) cut = text.length - 1;
  }

  return text.slice(0, cut);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SegmentOptions {
  /**
   * When provided, whiteboard-worthy equations only become cards if their
   * latex is in this set (i.e. finished drawing). When omitted, all worthy
   * equations render as cards (used for finished / historical messages).
   */
  readyEquations?: ReadonlySet<string>;
  /** When true, hide worthy equations that are not yet in readyEquations. */
  hideUntilReady?: boolean;
}

/**
 * Splits `text` into text / equation segments for the chat UI.
 *
 * - Trivial inline math → plain text (no `$`, no card)
 * - Whiteboard-worthy math → equation card only if listed in `readyEquations`
 * - Not-yet-ready worthy math → omitted (hidden until draw finishes)
 * - Incomplete trailing delimiters should be stripped by the caller first
 */
export function segmentTextWithEquations(
  text: string,
  options: SegmentOptions = {}
): MessageSegment[] {
  const { readyEquations, hideUntilReady = false } = options;
  const spans = findAllEquationSpans(text);

  if (spans.length === 0) {
    return text ? [{ type: "text", content: text }] : [];
  }

  const segments: MessageSegment[] = [];
  let pos = 0;

  for (const span of spans) {
    if (span.start > pos) {
      const content = text.slice(pos, span.start);
      if (content) segments.push({ type: "text", content });
    }

    const key = span.latex.trim();
    const worthy = isWhiteboardWorthy(span.latex);
    const isDisplayOrProse = span.kind === "display" || span.kind === "prose";

    if (worthy && isDisplayOrProse) {
      const isReady = !hideUntilReady || readyEquations?.has(key) === true;
      if (isReady) {
        segments.push({ type: "equation", latex: span.latex });
      }
      // else: still drawing — omit from chat (no $$ / raw \frac flash)
    } else if (SUBSTANTIAL_CMD_RE.test(span.latex)) {
      // Bare fraction etc. that somehow wasn't classified worthy — still hide
      // until ready rather than dump raw \frac into the chat.
      const isReady = !hideUntilReady || readyEquations?.has(key) === true;
      if (isReady) {
        segments.push({ type: "equation", latex: span.latex });
      }
    } else {
      // Trivial / inline — show as plain prose without delimiters
      segments.push({ type: "text", content: span.latex });
    }

    pos = span.end;
  }

  if (pos < text.length) {
    const content = text.slice(pos);
    if (content) segments.push({ type: "text", content });
  }

  // Merge adjacent text segments
  const merged: MessageSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (seg.type === "text" && last?.type === "text") {
      last.content += seg.content;
    } else {
      merged.push(seg);
    }
  }

  return merged;
}

/**
 * Extracts whiteboard-worthy equations that are complete and not yet in `seen`.
 * Only display-math / substantial prose lines are returned — never trivial $x$.
 *
 * Mutates `seen` by adding newly found equations.
 */
export function extractNewEquations(
  text: string,
  seen: Set<string>
): string[] {
  const result: string[] = [];

  // Prefer text up to last newline for prose safety; delimited math still
  // works on the full string via findAllEquationSpans.
  const safeText = text.includes("\n")
    ? text.slice(0, text.lastIndexOf("\n") + 1)
    : text;

  const spans = findAllEquationSpans(safeText || text);

  for (const span of spans) {
    // Inline $x$ stays out of the whiteboard; bare \frac and display math go in
    if (span.kind === "inline" && !SUBSTANTIAL_CMD_RE.test(span.latex)) continue;
    if (!isWhiteboardWorthy(span.latex) && !SUBSTANTIAL_CMD_RE.test(span.latex)) {
      continue;
    }

    const key = span.latex.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(span.latex);
    }
  }

  return result;
}
