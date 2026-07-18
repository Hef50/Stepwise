/**
 * Whiteboard diagram style preferences (sketchy vs clean, stroke color).
 * Persisted in localStorage; baked into shapes at creation.
 */

export type DiagramStyle = "sketchy" | "clean";

export const WB_DIAGRAM_STYLE_STORAGE_KEY = "stepwise_wb_diagram_style";
export const WB_DIAGRAM_COLOR_STORAGE_KEY = "stepwise_wb_diagram_color";

export const DEFAULT_WB_DIAGRAM_STYLE: DiagramStyle = "sketchy";
export const DEFAULT_WB_DIAGRAM_COLOR = "#1a1a1a";

export function loadWbDiagramStyle(): DiagramStyle {
  try {
    const raw = window.localStorage.getItem(WB_DIAGRAM_STYLE_STORAGE_KEY);
    if (raw === "sketchy" || raw === "clean") return raw;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WB_DIAGRAM_STYLE;
}

export function saveWbDiagramStyle(style: DiagramStyle): void {
  try {
    window.localStorage.setItem(WB_DIAGRAM_STYLE_STORAGE_KEY, style);
  } catch {
    // ignore
  }
}

export function loadWbDiagramColor(): string {
  try {
    const raw = window.localStorage.getItem(WB_DIAGRAM_COLOR_STORAGE_KEY);
    if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_WB_DIAGRAM_COLOR;
}

export function saveWbDiagramColor(color: string): void {
  try {
    window.localStorage.setItem(WB_DIAGRAM_COLOR_STORAGE_KEY, color);
  } catch {
    // ignore
  }
}
