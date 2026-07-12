/**
 * LaTeX on-canvas font size preference.
 *
 * Shapes are sized by a fixed scale from MathJax viewBox units → canvas px
 * (see estimateShapeDimensions), so every equation shares the same glyph size
 * regardless of how wide/tall the expression is.
 */

export const LATEX_FONT_SIZE_STORAGE_KEY = "stepwise_latex_font_size";

/** Approximate canvas px for a 1em MathJax line (~1000 viewBox units). */
export const DEFAULT_LATEX_FONT_SIZE = 40;
export const MIN_LATEX_FONT_SIZE = 20;
export const MAX_LATEX_FONT_SIZE = 72;
export const LATEX_FONT_SIZE_STEP = 4;

/** MathJax SVG vertical units that roughly correspond to 1em. */
export const MATHJAX_EM_UNITS = 1000;

export function loadLatexFontSize(): number {
  try {
    const raw = window.localStorage.getItem(LATEX_FONT_SIZE_STORAGE_KEY);
    const n = raw ? Number(raw) : DEFAULT_LATEX_FONT_SIZE;
    if (
      Number.isFinite(n) &&
      n >= MIN_LATEX_FONT_SIZE &&
      n <= MAX_LATEX_FONT_SIZE
    ) {
      return n;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_LATEX_FONT_SIZE;
}

export function saveLatexFontSize(size: number): void {
  try {
    window.localStorage.setItem(LATEX_FONT_SIZE_STORAGE_KEY, String(size));
  } catch {
    // ignore
  }
}

export function latexFontSizeLabel(size: number): string {
  if (size <= 28) return "Small";
  if (size <= 44) return "Medium";
  if (size <= 56) return "Large";
  return "XL";
}
