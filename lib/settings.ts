export interface VoiceSettings {
  talkingSpeed: number;
  ttsEnabled: boolean;
}

const KEY = "stepwise_voice_settings";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  talkingSpeed: 1,
  ttsEnabled: true,
};

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const talkingSpeed = Number(parsed.talkingSpeed);
    return {
      talkingSpeed:
        Number.isFinite(talkingSpeed) && talkingSpeed >= 0.5 && talkingSpeed <= 2
          ? talkingSpeed
          : DEFAULT_VOICE_SETTINGS.talkingSpeed,
      ttsEnabled:
        typeof parsed.ttsEnabled === "boolean"
          ? parsed.ttsEnabled
          : DEFAULT_VOICE_SETTINGS.ttsEnabled,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: Partial<VoiceSettings>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...loadVoiceSettings(), ...settings })
    );
  } catch {
    // Storage is optional; browser voice still works without it.
  }
}
