import { parse, type Font, type Glyph } from "opentype.js";
import { stringToPaths as hersheyStringToPaths } from "hershey";
import type { SvgPathData } from "@/lib/types";
import type { WhiteboardTextMode } from "@/lib/whiteboard/textStyle";

export const MAX_ANIMATED_TEXT_PATHS = 200;

/** Handwriting outline font (Caveat) — traced like LaTeX glyphs. */
const OUTLINE_FONT_URL = "/fonts/Caveat-Regular.ttf";

/**
 * Hershey simplex units → roughly 1em capital height.
 * Caps span about -9..12 in hershey Y; 21 keeps size ≈ on-canvas fontSize.
 */
const HERSHEY_EM = 21;

export interface ParsedTextPaths {
  paths: SvgPathData[];
  viewBox: string;
}

const fontCache = new Map<string, Promise<Font>>();

function loadOutlineFont(): Promise<Font> {
  const existing = fontCache.get(OUTLINE_FONT_URL);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(OUTLINE_FONT_URL);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch font ${OUTLINE_FONT_URL}: HTTP ${res.status}`
      );
    }
    const buffer = await res.arrayBuffer();
    const font = parse(buffer);
    if (!font || typeof font.getPath !== "function") {
      throw new Error(
        `opentype.parse returned an invalid font for ${OUTLINE_FONT_URL}`
      );
    }
    return font;
  })();

  fontCache.set(OUTLINE_FONT_URL, promise);
  promise.catch(() => {
    fontCache.delete(OUTLINE_FONT_URL);
  });
  return promise;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ─── Stroke mode: true Hershey centerlines (correct pen order) ───────────────

/**
 * Convert text to open polyline strokes via the `hershey` package.
 * Each stroke is a separate path so animation draws real pen order
 * (unlike AVHershey OTF, which stores closed outline ribbons).
 */
function hersheyTextToPaths(
  text: string,
  fontSize: number
): ParsedTextPaths {
  const trimmed = text.trim();
  if (!trimmed) {
    return { paths: [], viewBox: "0 0 100 40" };
  }

  const { bounds, paths: strokes } = hersheyStringToPaths(trimmed);
  const scale = fontSize / HERSHEY_EM;

  // Hershey Y is up; SVG Y is down. Pad enough for round stroke caps.
  const pad = Math.max(3, fontSize * 0.2);

  const minX = bounds.minX * scale - pad;
  const maxX = bounds.maxX * scale + pad;
  // Flip Y: hershey maxY is top → svg minY
  const minY = -bounds.maxY * scale - pad;
  const maxY = -bounds.minY * scale + pad;

  const svgPaths: SvgPathData[] = [];
  for (const stroke of strokes) {
    if (!stroke || stroke.length < 2) continue;
    const parts: string[] = [];
    for (let i = 0; i < stroke.length; i++) {
      const pt = stroke[i];
      if (!pt || pt.length < 2) continue;
      const x = round(pt[0]! * scale, 2);
      const y = round(-pt[1]! * scale, 2);
      parts.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
    }
    if (parts.length >= 2) {
      svgPaths.push({ d: parts.join("") });
    }
  }

  const vw = Math.max(maxX - minX, 1);
  const vh = Math.max(maxY - minY, 1);

  return {
    paths: svgPaths.slice(0, MAX_ANIMATED_TEXT_PATHS),
    viewBox: `${minX} ${minY} ${vw} ${vh}`,
  };
}

// ─── Outline mode: Caveat filled letterforms ─────────────────────────────────

/**
 * Scale a glyph's raw path (font units, Y-up) into SVG coords (Y-down),
 * preserving Z closes that opentype.js v2 drops in getPath().
 */
function glyphToSvgD(
  glyph: Glyph,
  x: number,
  baseline: number,
  fontSize: number,
  unitsPerEm: number,
  decimals = 2
): { d: string; minX: number; minY: number; maxX: number; maxY: number } {
  if (!glyph.path || glyph.path.commands.length === 0) {
    glyph.getPath(0, 0, fontSize);
  }
  const commands = glyph.path?.commands;
  if (!commands || commands.length === 0) {
    return { d: "", minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  const scale = fontSize / unitsPerEm;
  const parts: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const sx = (px: number) => {
    const v = x + px * scale;
    minX = Math.min(minX, v);
    maxX = Math.max(maxX, v);
    return round(v, decimals);
  };
  const sy = (py: number) => {
    const v = baseline - py * scale;
    minY = Math.min(minY, v);
    maxY = Math.max(maxY, v);
    return round(v, decimals);
  };

  for (const c of commands) {
    switch (c.type) {
      case "M":
        parts.push(`M${sx(c.x)} ${sy(c.y)}`);
        break;
      case "L":
        parts.push(`L${sx(c.x)} ${sy(c.y)}`);
        break;
      case "Q":
        parts.push(
          `Q${sx(c.x1)} ${sy(c.y1)} ${sx(c.x)} ${sy(c.y)}`
        );
        break;
      case "C":
        parts.push(
          `C${sx(c.x1)} ${sy(c.y1)} ${sx(c.x2)} ${sy(c.y2)} ${sx(c.x)} ${sy(c.y)}`
        );
        break;
      case "Z":
        parts.push("Z");
        break;
      default:
        break;
    }
  }

  return {
    d: parts.join(""),
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    maxX: Number.isFinite(maxX) ? maxX : 0,
    maxY: Number.isFinite(maxY) ? maxY : 0,
  };
}

async function outlineTextToPaths(
  text: string,
  fontSize: number
): Promise<ParsedTextPaths> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { paths: [], viewBox: "0 0 100 40" };
  }

  const font = await loadOutlineFont();
  const size = Math.max(fontSize, 8);
  // Use font metrics so ascenders/descenders always fit (even if a glyph
  // reports incomplete bounds).
  const scale = size / font.unitsPerEm;
  const ascent = (font.ascender || 800) * scale;
  const descent = Math.abs(font.descender || 200) * scale;
  const baseline = ascent;
  const lineTop = 0;
  const lineBottom = ascent + descent;

  const paths: SvgPathData[] = [];
  let x = 0;
  let minX = Infinity;
  let minY = lineTop;
  let maxX = -Infinity;
  let maxY = lineBottom;

  for (const char of trimmed) {
    if (char === " " || char === "\t" || char === "\n") {
      const space = font.charToGlyph(" ");
      x += (space.advanceWidth || font.unitsPerEm * 0.3) * scale;
      continue;
    }

    const glyph = font.charToGlyph(char);
    const { d, minX: gx1, minY: gy1, maxX: gx2, maxY: gy2 } = glyphToSvgD(
      glyph,
      x,
      baseline,
      size,
      font.unitsPerEm,
      2
    );
    if (d.length > 0) {
      paths.push({ d });
      minX = Math.min(minX, gx1);
      maxX = Math.max(maxX, gx2);
      minY = Math.min(minY, gy1, lineTop);
      maxY = Math.max(maxY, gy2, lineBottom);
    }
    x += (glyph.advanceWidth || 0) * scale;
  }

  if (paths.length === 0 || !Number.isFinite(minX)) {
    return { paths: [], viewBox: `0 0 ${size * 4} ${size + 8}` };
  }

  const pad = Math.max(2, size * 0.12);
  const vw = Math.max(maxX - minX + pad * 2, 1);
  const vh = Math.max(maxY - minY + pad * 2, 1);

  return {
    paths: paths.slice(0, MAX_ANIMATED_TEXT_PATHS),
    viewBox: `${minX - pad} ${minY - pad} ${vw} ${vh}`,
  };
}

/**
 * Convert plain text to per-stroke / per-glyph SVG path data.
 * Must be called in a browser context.
 */
export async function textToSvgPaths(
  text: string,
  mode: WhiteboardTextMode,
  fontSize: number
): Promise<ParsedTextPaths> {
  if (typeof window === "undefined") {
    throw new Error("textToSvgPaths must be called in a browser context");
  }

  if (mode === "stroke") {
    return hersheyTextToPaths(text, Math.max(fontSize, 8));
  }
  return outlineTextToPaths(text, Math.max(fontSize, 8));
}

/**
 * Estimate canvas shape dimensions from the text viewBox.
 * Unlike MathJax (fixed em units), text viewBox is already in font-size pixels.
 */
export function estimateTextShapeDimensions(viewBox: string): {
  w: number;
  h: number;
} {
  const parts = viewBox.split(/\s+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) {
    return { w: 120, h: 48 };
  }
  const [, , vw, vh] = parts;
  if (!vw || !vh) return { w: 120, h: 48 };
  return {
    w: Math.max(Math.ceil(vw), 24),
    h: Math.max(Math.ceil(vh), 24),
  };
}
