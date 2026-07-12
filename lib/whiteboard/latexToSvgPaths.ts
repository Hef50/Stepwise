import type { SvgPathData } from "@/lib/types";

/**
 * Maximum number of paths to animate. Beyond this the shape renders statically
 * to avoid excessive animation overhead for very complex equations.
 */
export const MAX_ANIMATED_PATHS = 200;

export interface ParsedSvgPaths {
  paths: SvgPathData[];
  viewBox: string;
}

/**
 * Parses the SVG string from the /api/latex/svg route into a flat list of
 * resolved path data objects and the SVG viewBox.
 *
 * Because the server uses MathJax with `fontCache: 'none'`, all glyphs are
 * already emitted as inline <path> elements — no <use> resolution is needed.
 *
 * Must be called in a browser context (uses DOMParser).
 */
/**
 * Walks from `el` up to (but excluding) `root`, concatenating every ancestor's
 * `transform` attribute in root-first order. This reproduces the effective
 * transform each SVG element inherits from its nesting, so a flattened <path>
 * can be positioned identically to its original place in the tree.
 */
function getAccumulatedTransform(
  el: Element,
  root: Element
): string | undefined {
  const transforms: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const t = cur.getAttribute("transform");
    if (t) transforms.unshift(t);
    cur = cur.parentElement;
  }
  return transforms.length > 0 ? transforms.join(" ") : undefined;
}

export function parseSvgPaths(svgString: string): ParsedSvgPaths {
  if (typeof window === "undefined") {
    throw new Error("parseSvgPaths must be called in a browser context");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    console.warn("[latexToSvgPaths] SVG parse error:", parserError.textContent);
    return { paths: [], viewBox: "0 0 100 40" };
  }

  const svgEl = doc.querySelector("svg");
  if (!svgEl) {
    return { paths: [], viewBox: "0 0 100 40" };
  }

  const viewBox = svgEl.getAttribute("viewBox") ?? "0 0 100 40";

  // Query <path> AND <rect> in document order. MathJax draws glyph outlines as
  // <path>, but renders fraction bars, \sqrt vincula and \overline rules as
  // <rect> elements — those were previously dropped, so fractions rendered with
  // no dividing line. Convert each rect into an equivalent closed path.
  const drawableEls = Array.from(svgEl.querySelectorAll("path, rect"));

  const paths: SvgPathData[] = drawableEls.reduce<SvgPathData[]>((acc, el) => {
    // MathJax stores all positioning (the scale(1,-1) Y-flip and per-glyph
    // translate groups) on ancestor <g> elements, not on the element itself.
    // Accumulate every ancestor transform (root-first) so the glyph renders
    // in the correct position and orientation.
    const transform = getAccumulatedTransform(el, svgEl);

    if (el.tagName.toLowerCase() === "rect") {
      const x = Number(el.getAttribute("x") ?? "0") || 0;
      const y = Number(el.getAttribute("y") ?? "0") || 0;
      const rw = Number(el.getAttribute("width") ?? "0") || 0;
      const rh = Number(el.getAttribute("height") ?? "0") || 0;
      if (rw <= 0 || rh <= 0) return acc;
      const d = `M${x} ${y}h${rw}v${rh}h${-rw}Z`;
      acc.push({ d, transform });
      return acc;
    }

    const d = el.getAttribute("d");
    if (!d) return acc;
    acc.push({ d, transform });
    return acc;
  }, []);

  return { paths, viewBox };
}

/**
 * Estimates canvas shape dimensions from the MathJax SVG viewBox.
 * Scales the equation to a target width of 400 canvas units.
 */
export function estimateShapeDimensions(
  viewBox: string,
  targetWidth = 400
): { w: number; h: number } {
  const parts = viewBox.split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) {
    return { w: targetWidth, h: 100 };
  }

  const [, , vw, vh] = parts;
  if (!vw || !vh) return { w: targetWidth, h: 100 };

  const scale = targetWidth / vw;
  const h = Math.max(Math.ceil(vh * scale) + 16, 40);
  return { w: targetWidth, h };
}
