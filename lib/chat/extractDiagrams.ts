/**
 * Utilities for finding whiteboard diagram markers in assistant message text:
 *
 *   [[diagram: {"layout":"graph","nodes":[...],"edges":[...]}]]
 *
 * Used as the LLM7 (no-tools) fallback — Gemma uses render_diagram_whiteboard.
 */

import {
  diagramSpecKey,
  parseDiagramSpec,
  type DiagramSpec,
} from "@/lib/whiteboard/diagramSpec";

const MARKER_OPEN = "[[diagram:";
const MARKER_CLOSE = "]]";

/**
 * Find balanced `[[diagram: …]]` markers. Uses brace-counting inside the
 * JSON payload so nested `]` inside strings don't truncate early — we scan
 * for the closing `]]` only after the JSON object appears complete, falling
 * back to the first `]]` after the opening marker.
 */
function findDiagramMarkers(
  text: string
): Array<{ start: number; end: number; json: string }> {
  const results: Array<{ start: number; end: number; json: string }> = [];
  const lower = text.toLowerCase();
  let from = 0;

  while (from < text.length) {
    const start = lower.indexOf(MARKER_OPEN, from);
    if (start === -1) break;

    const jsonStart = start + MARKER_OPEN.length;
    // Skip leading whitespace
    let i = jsonStart;
    while (i < text.length && /\s/.test(text[i]!)) i++;

    if (text[i] !== "{") {
      // Not a JSON object — skip past this opener
      from = jsonStart;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    let jsonEnd = -1;

    for (; i < text.length; i++) {
      const ch = text[i]!;
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      // Incomplete JSON — stop searching (streaming still in progress)
      break;
    }

    // Expect optional whitespace then ]]
    let j = jsonEnd;
    while (j < text.length && /\s/.test(text[j]!)) j++;
    if (text.slice(j, j + 2) !== MARKER_CLOSE) {
      from = jsonEnd;
      continue;
    }

    const end = j + 2;
    const json = text.slice(jsonStart, jsonEnd).trim();
    results.push({ start, end, json });
    from = end;
  }

  return results;
}

/**
 * Extracts new complete [[diagram: …]] specs not yet in `seen`.
 * Mutates `seen` by adding newly found spec keys.
 */
export function extractNewDiagrams(
  text: string,
  seen: Set<string>
): DiagramSpec[] {
  const result: DiagramSpec[] = [];
  for (const marker of findDiagramMarkers(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(marker.json);
    } catch {
      continue;
    }
    const spec = parseDiagramSpec(parsed);
    if (!spec) continue;
    const key = diagramSpecKey(spec);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(spec);
  }
  return result;
}

/** Remove all complete [[diagram:…]] markers from displayed chat text. */
export function stripDiagramMarkers(text: string): string {
  const markers = findDiagramMarkers(text);
  if (markers.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const m of markers) {
    out += text.slice(cursor, m.start);
    cursor = m.end;
  }
  out += text.slice(cursor);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Truncates `text` so an incomplete `[[diagram:` opener / JSON never appears.
 */
export function stripIncompleteDiagramMarker(text: string): string {
  const lower = text.toLowerCase();
  const start = lower.lastIndexOf(MARKER_OPEN);
  if (start === -1) {
    // Catch partial openers
    const partials = [
      "[[diagram:",
      "[[diagram",
      "[[diagra",
      "[[diagr",
      "[[diag",
      "[[dia",
      "[[di",
      "[[d",
      "[[",
    ];
    for (const p of partials) {
      if (text.length >= p.length && text.toLowerCase().endsWith(p)) {
        return text.slice(0, text.length - p.length);
      }
    }
    return text;
  }

  const complete = findDiagramMarkers(text);
  const lastComplete = complete.length > 0 ? complete[complete.length - 1] : null;
  if (lastComplete && lastComplete.start === start) {
    // Last marker is complete — check for a newer partial after it
    const after = text.slice(lastComplete.end);
    const afterLower = after.toLowerCase();
    if (afterLower.includes(MARKER_OPEN) || afterLower.endsWith("[[")) {
      const partialStart = lastComplete.end + afterLower.indexOf("[[");
      return text.slice(0, partialStart);
    }
    return text;
  }

  // Incomplete marker starting at `start`
  return text.slice(0, start);
}

/** Strip both incomplete and complete diagram markers for chat display. */
export function sanitizeDiagramForDisplay(text: string): string {
  return stripDiagramMarkers(stripIncompleteDiagramMarker(text));
}

/**
 * If `count` sits at/inside a complete `[[diagram:…]]` marker, jump past it
 * so chat reveal does not slowly type through invisible JSON (and diagrams
 * can start drawing as soon as the stream completes the object).
 */
export function revealCountSkipDiagramMarkers(
  text: string,
  count: number
): number {
  if (count < 0) return 0;
  const markers = findDiagramMarkers(text);
  for (const m of markers) {
    if (count >= m.start && count < m.end) {
      return m.end;
    }
  }

  // If the next characters open a diagram marker that is already complete
  // further in `text`, jump over it immediately.
  const lower = text.toLowerCase();
  const from = Math.max(0, count);
  const nextOpen = lower.indexOf(MARKER_OPEN, from);
  if (nextOpen === count) {
    const hit = markers.find((m) => m.start === nextOpen);
    if (hit) return hit.end;
  }

  return count;
}
