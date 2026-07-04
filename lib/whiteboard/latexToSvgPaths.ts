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

  const pathEls = Array.from(svgEl.querySelectorAll("path"));

  const paths: SvgPathData[] = pathEls.reduce<SvgPathData[]>((acc, el) => {
    const d = el.getAttribute("d");
    if (!d) return acc;
    const transform = el.getAttribute("transform") ?? undefined;
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
