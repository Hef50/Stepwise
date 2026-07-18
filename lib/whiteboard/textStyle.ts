/**
 * Whiteboard handwritten-text style preferences (size, color, draw mode).
 * Persisted in localStorage; size changes rescale existing text shapes.
 */

export type WhiteboardTextMode = "stroke" | "outline";

export const WB_TEXT_SIZE_STORAGE_KEY = "stepwise_wb_text_size";
export const WB_TEXT_COLOR_STORAGE_KEY = "stepwise_wb_text_color";
export const WB_TEXT_MODE_STORAGE_KEY = "stepwise_wb_text_mode";

export const DEFAULT_WB_TEXT_SIZE = 36;
export const MIN_WB_TEXT_SIZE = 16;
export const MAX_WB_TEXT_SIZE = 72;
export const WB_TEXT_SIZE_STEP = 4;

export const DEFAULT_WB_TEXT_COLOR = "#1a1a1a";
export const DEFAULT_WB_TEXT_MODE: WhiteboardTextMode = "stroke";

export function loadWbTextSize(): number {
  try {
    const raw = window.localStorage.getItem(WB_TEXT_SIZE_STORAGE_KEY);
    const n = raw ? Number(raw) : DEFAULT_WB_TEXT_SIZE;
    if (
      Number.isFinite(n) &&
      n >= MIN_WB_TEXT_SIZE &&
      n <= MAX_WB_TEXT_SIZE
    ) {
      return n;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WB_TEXT_SIZE;
}

export function saveWbTextSize(size: number): void {
  try {
    window.localStorage.setItem(WB_TEXT_SIZE_STORAGE_KEY, String(size));
  } catch {
    // ignore
  }
}

export function loadWbTextColor(): string {
  try {
    const raw = window.localStorage.getItem(WB_TEXT_COLOR_STORAGE_KEY);
    if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WB_TEXT_COLOR;
}

export function saveWbTextColor(color: string): void {
  try {
    window.localStorage.setItem(WB_TEXT_COLOR_STORAGE_KEY, color);
  } catch {
    // ignore
  }
}

export function loadWbTextMode(): WhiteboardTextMode {
  try {
    const raw = window.localStorage.getItem(WB_TEXT_MODE_STORAGE_KEY);
    if (raw === "stroke" || raw === "outline") return raw;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WB_TEXT_MODE;
}

export function saveWbTextMode(mode: WhiteboardTextMode): void {
  try {
    window.localStorage.setItem(WB_TEXT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function wbTextSizeLabel(size: number): string {
  if (size <= 24) return "Small";
  if (size <= 40) return "Medium";
  if (size <= 56) return "Large";
  return "XL";
}
