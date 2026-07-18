/**
 * Separate speed channels for chat reveal vs whiteboard hand-drawing.
 * Each channel is persisted independently so diagram draw can stay slow
 * while chat text stays readable.
 */

import {
  INSTANT_CPS,
  MAX_CPS_INPUT,
  MIN_CPS,
  setSharedTextSpeed,
} from "@/lib/chat/textReveal";

export type SpeedChannel = "chat" | "latex" | "text" | "diagram";

export const SPEED_CHANNELS: SpeedChannel[] = [
  "chat",
  "latex",
  "text",
  "diagram",
];

export const SPEED_LABELS: Record<SpeedChannel, string> = {
  chat: "Chat reveal",
  latex: "Equation draw",
  text: "Label draw",
  diagram: "Diagram shapes",
};

/** Defaults — diagram intentionally slow (many short strokes). */
export const SPEED_DEFAULTS: Record<SpeedChannel, number> = {
  chat: 8,
  latex: 5,
  text: 5,
  diagram: 1.5,
};

/** Lower bounds (never allow 0 except via Instant). */
export const SPEED_MIN: Record<SpeedChannel, number> = {
  chat: MIN_CPS,
  latex: MIN_CPS,
  text: MIN_CPS,
  diagram: 0.4,
};

/**
 * Slider ceilings — diagram/text/latex caps keep draws from becoming a blur.
 * Chat can still go high for fast readers.
 */
export const SPEED_MAX_SLIDER: Record<SpeedChannel, number> = {
  chat: 400,
  latex: 60,
  text: 60,
  diagram: 24,
};

const STORAGE_KEYS: Record<SpeedChannel, string> = {
  chat: "stepwise_text_cps", // legacy key — keep so existing prefs migrate
  latex: "stepwise_latex_draw_cps",
  text: "stepwise_label_draw_cps",
  diagram: "stepwise_diagram_draw_cps",
};

type SpeedListener = () => void;

const current: Record<SpeedChannel, number> = { ...SPEED_DEFAULTS };
const listeners = new Set<SpeedListener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function clampChannel(channel: SpeedChannel, cps: number): number {
  if (!Number.isFinite(cps) || cps <= 0) return INSTANT_CPS;
  const min = SPEED_MIN[channel];
  const max = Math.min(MAX_CPS_INPUT, SPEED_MAX_SLIDER[channel] * 2);
  return Math.min(max, Math.max(min, cps));
}

export function getDrawSpeed(channel: SpeedChannel): number {
  return current[channel];
}

export function setDrawSpeed(channel: SpeedChannel, cps: number): void {
  const clamped = clampChannel(channel, cps);
  current[channel] = clamped;
  try {
    window.localStorage.setItem(STORAGE_KEYS[channel], String(clamped));
  } catch {
    // ignore
  }
  if (channel === "chat") {
    setSharedTextSpeed(clamped);
  }
  notify();
}

export function subscribeDrawSpeeds(listener: SpeedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadDrawSpeed(channel: SpeedChannel): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[channel]);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) {
        current[channel] = clampChannel(channel, n);
        if (channel === "chat") setSharedTextSpeed(current[channel]);
        return current[channel];
      }
    }
  } catch {
    // localStorage unavailable
  }
  current[channel] = SPEED_DEFAULTS[channel];
  if (channel === "chat") setSharedTextSpeed(current[channel]);
  return current[channel];
}

export function loadAllDrawSpeeds(): Record<SpeedChannel, number> {
  const out = {} as Record<SpeedChannel, number>;
  for (const ch of SPEED_CHANNELS) {
    out[ch] = loadDrawSpeed(ch);
  }
  return out;
}

export function speedChannelLabel(cps: number): string {
  if (cps <= 0) return "Instant";
  if (cps < 1) return "Very slow";
  if (cps < 3) return "Slow";
  if (cps < 10) return "Medium";
  if (cps < 30) return "Fast";
  return "Very fast";
}

/** Parse typed cps for a channel; empty / instant keywords → Instant. */
export function parseChannelCpsInput(
  channel: SpeedChannel,
  raw: string
): number {
  const t = raw.trim();
  if (t === "" || t === "∞" || t.toLowerCase() === "instant") {
    return INSTANT_CPS;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return INSTANT_CPS;
  return clampChannel(channel, n);
}
