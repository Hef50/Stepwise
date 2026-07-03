/**
 * Best-effort cleanup of AI-generated Mermaid so common mistakes don't crash
 * the renderer. The most frequent failure is unquoted node labels that contain
 * parentheses or other reserved characters, e.g. `A[Function f(x)]`, which
 * Mermaid rejects. We wrap such labels in quotes: `A["Function f(x)"]`.
 */

// Characters that require a quoted Mermaid label.
const NEEDS_QUOTING = /[()<>]/;

/** Quotes the inside of a bracketed label when it contains reserved chars. */
function quoteLabels(code: string, open: string, close: string): string {
  const escOpen = open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escClose = close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match node id followed by an unquoted label: X[...], X(...), X{...}
  const pattern = new RegExp(`(\\w+\\s*)${escOpen}([^"${escClose}]*?)${escClose}`, "g");

  return code.replace(pattern, (full, prefix: string, label: string) => {
    const trimmed = label.trim();
    // Already quoted or nothing to fix.
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return full;
    if (!NEEDS_QUOTING.test(trimmed)) return full;
    // Escape any stray double quotes inside the label.
    const safe = trimmed.replace(/"/g, "'");
    return `${prefix}${open}"${safe}"${close}`;
  });
}

export function sanitizeMermaid(code: string): string {
  let out = code.trim();
  out = quoteLabels(out, "[", "]");
  out = quoteLabels(out, "(", ")");
  out = quoteLabels(out, "{", "}");
  return out;
}
