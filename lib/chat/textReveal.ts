export const TEXT_CPS_STORAGE_KEY = "stepwise_text_cps";
/** Legacy slider-index key — migrated once on load. */
const LEGACY_TEXT_SPEED_STORAGE_KEY = "stepwise_text_speed";

/** Default reveal rate (chars/sec). */
export const DEFAULT_CPS = 8;
/** Slowest slider / typed value. */
export const MIN_CPS = 0.5;
/** Fast end of the range slider (typed input can go higher). */
export const MAX_CPS_SLIDER = 400;
/** Absolute cap for the number input. */
export const MAX_CPS_INPUT = 9999;
/**
 * Stored / passed as `0` (or any non-positive) to mean instant reveal —
 * no throttle on chat or LaTeX draw.
 */
export const INSTANT_CPS = 0;

/** @deprecated Use MAX_CPS_SLIDER — kept so older imports keep compiling. */
export const MAX_TEXT_SPEED = MAX_CPS_SLIDER;
export const DEFAULT_TEXT_SPEED = DEFAULT_CPS;

/**
 * Resolve a stored/UI cps value to a reveal rate.
 * `<= 0` → instant (`null`).
 */
export function speedToCharsPerSecond(cps: number): number | null {
  if (!Number.isFinite(cps) || cps <= 0) return null;
  return cps;
}

/**
 * Map cps to a base per-path LaTeX draw duration (ms).
 * null = instant.
 */
export function speedToLatexStepMs(cps: number): number | null {
  const rate = speedToCharsPerSecond(cps);
  if (rate === null) return null;
  return Math.round(3000 / rate);
}

export type WhiteboardDrawKind = "latex" | "text" | "diagram";

/**
 * Per-path stroke duration (ms) for whiteboard hand-drawing.
 * Scales across the full reading-speed slider for latex, text, and diagrams.
 * Returns `null` for instant mode (cps <= 0).
 */
export function computeDrawStepMs(
  cps: number,
  pathCount: number,
  options?: {
    contentLength?: number;
    kind?: WhiteboardDrawKind;
  }
): number | null {
  const rate = speedToCharsPerSecond(cps);
  if (rate === null) return null;

  const paths = Math.max(pathCount, 1);
  const kind = options?.kind ?? "latex";
  const contentLength = Math.max(0, options?.contentLength ?? 0);

  // Baseline ms/path at DEFAULT_CPS — diagrams need much slower strokes
  // (many paths); labels and equations sit in between.
  const basePerPath =
    kind === "diagram" ? 320 : kind === "text" ? 190 : 220;

  // Also stretch a bit when there is substantial content (equations / labels)
  const contentFactor =
    contentLength > 0
      ? Math.min(1.6, Math.max(1, contentLength / (paths * 3)))
      : 1;

  // Inverse with reading rate relative to the default slider position
  const scaled = basePerPath * contentFactor * (DEFAULT_CPS / rate);

  // Diagrams: higher floor so they never become a blur at "fast" settings
  const minStep = kind === "diagram" ? 90 : kind === "text" ? 55 : 50;
  const maxStep = kind === "diagram" ? 1400 : 800;
  return Math.round(Math.min(maxStep, Math.max(minStep, scaled)));
}

/**
 * Compute per-path draw ms so the whole equation tracks typing pace at `cps`.
 * @deprecated Prefer `computeDrawStepMs` — kept for call-site compatibility.
 */
export function computeLatexStepMs(
  cps: number,
  latex: string,
  pathCount: number
): number | null {
  return computeDrawStepMs(cps, pathCount, {
    contentLength: latex.trim().length,
    kind: "latex",
  });
}

// ─── Shared live speed for the whiteboard shape renderer ─────────────────────

type SpeedListener = () => void;

let currentCps = DEFAULT_CPS;
const speedListeners = new Set<SpeedListener>();

export function setSharedTextSpeed(cps: number): void {
  currentCps = cps;
  for (const listener of speedListeners) listener();
}

export function getSharedTextSpeed(): number {
  return currentCps;
}

export function subscribeSharedTextSpeed(listener: SpeedListener): () => void {
  speedListeners.add(listener);
  return () => {
    speedListeners.delete(listener);
  };
}

export function getSharedLatexStepMs(): number | null {
  return speedToLatexStepMs(currentCps);
}

/** Old 1–16 slider index → approximate cps (one-time migration). */
function migrateLegacySliderIndex(index: number): number {
  if (index >= 16) return INSTANT_CPS;
  return Math.max(MIN_CPS, Number((1 * Math.pow(1.28, index - 1)).toFixed(2)));
}

export function loadTextSpeed(): number {
  try {
    const rawCps = window.localStorage.getItem(TEXT_CPS_STORAGE_KEY);
    if (rawCps != null) {
      const n = Number(rawCps);
      if (Number.isFinite(n) && n >= 0 && n <= MAX_CPS_INPUT) {
        currentCps = n;
        return n;
      }
    }

    // Migrate legacy 1–16 slider values once
    const legacy = window.localStorage.getItem(LEGACY_TEXT_SPEED_STORAGE_KEY);
    if (legacy != null) {
      const idx = Number(legacy);
      if (Number.isFinite(idx) && idx >= 1 && idx <= 16) {
        const cps = migrateLegacySliderIndex(idx);
        currentCps = cps;
        saveTextSpeed(cps);
        return cps;
      }
    }
  } catch {
    // localStorage unavailable
  }
  currentCps = DEFAULT_CPS;
  return DEFAULT_CPS;
}

export function saveTextSpeed(cps: number): void {
  const clamped =
    !Number.isFinite(cps) || cps <= 0
      ? INSTANT_CPS
      : Math.min(MAX_CPS_INPUT, Math.max(MIN_CPS, cps));
  try {
    window.localStorage.setItem(TEXT_CPS_STORAGE_KEY, String(clamped));
  } catch {
    // ignore
  }
  setSharedTextSpeed(clamped);
}

export function textSpeedLabel(cps: number): string {
  if (cps <= 0) return "Instant";
  if (cps < 2) return "Very slow";
  if (cps < 6) return "Slow";
  if (cps < 20) return "Medium";
  if (cps < 60) return "Fast";
  if (cps < 150) return "Very fast";
  return "Max";
}

/** Clamp a typed cps value; empty/invalid/`0` → instant. */
export function parseCpsInput(raw: string): number {
  const t = raw.trim();
  if (t === "" || t === "∞" || t.toLowerCase() === "instant") return INSTANT_CPS;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return INSTANT_CPS;
  return Math.min(MAX_CPS_INPUT, Math.max(MIN_CPS, n));
}
