export interface Settings {
  talkingSpeed: number; // speechSynthesis rate (0.5 - 2.0)
  ttsEnabled: boolean; // whether TTS is allowed
  autosaveWhiteboard: boolean; // whether to auto-save whiteboard captures
}

const KEY = "stepwise_settings";

export const DEFAULT_SETTINGS: Settings = {
  talkingSpeed: 1.0,
  ttsEnabled: true,
  autosaveWhiteboard: true,
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Partial<Settings>) {
  if (typeof window === "undefined") return;
  try {
    const current = loadSettings();
    const next = { ...current, ...s };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function resetSettings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(DEFAULT_SETTINGS));
  } catch {
    // ignore
  }
}
