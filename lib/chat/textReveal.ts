export const TEXT_SPEED_STORAGE_KEY = "stepwise_text_speed";
export const DEFAULT_TEXT_SPEED = 4;
export const MAX_TEXT_SPEED = 10;

/** Map slider value (1–10) to reveal rate. 10 = instant (null). */
export function speedToCharsPerSecond(speed: number): number | null {
  if (speed >= MAX_TEXT_SPEED) return null;
  return Math.round(20 * Math.pow(1.7, speed - 1));
}

export function loadTextSpeed(): number {
  try {
    const raw = window.localStorage.getItem(TEXT_SPEED_STORAGE_KEY);
    const n = raw ? Number(raw) : DEFAULT_TEXT_SPEED;
    if (Number.isFinite(n) && n >= 1 && n <= MAX_TEXT_SPEED) return n;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_TEXT_SPEED;
}

export function saveTextSpeed(speed: number): void {
  try {
    window.localStorage.setItem(TEXT_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // ignore
  }
}

export function textSpeedLabel(speed: number): string {
  if (speed >= MAX_TEXT_SPEED) return "Instant";
  if (speed <= 2) return "Slow";
  if (speed <= 5) return "Medium";
  if (speed <= 8) return "Fast";
  return "Very fast";
}
