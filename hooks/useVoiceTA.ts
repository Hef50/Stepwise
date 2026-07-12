"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { stripMarkdownForSpeech } from "@/lib/speech";
import type { VoiceControls, VoiceState, VoiceTranscriptEntry } from "@/lib/types";

/**
 * useVoiceTA — Provider-agnostic voice hook.
 *
 * Internally uses the native Web Speech API (SpeechRecognition + speechSynthesis).
 * The public interface (VoiceControls) is deliberately abstract so this
 * implementation can be replaced with OpenAI Whisper/TTS without touching any
 * component that consumes it.

*/

const isBrowser = typeof window !== "undefined";

type SpeechRecognitionLike = {
  abort: () => void;
  stop: () => void;
  start: () => void;
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: ((event?: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event?: Event) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechAudio {
  audioUrl: string;
  mimeType: string;
  model?: string;
  text: string;
}

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | undefined {
  if (!isBrowser) return undefined;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function isSpeechSynthesisSupported(): boolean {
  return isBrowser && "speechSynthesis" in window;
}

function createTranscriptEntry(
  role: VoiceTranscriptEntry["role"],
  text: string
): VoiceTranscriptEntry {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function splitSpeechIntoChunks(text: string): string[] {
  const maxLength = 180;
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];

  for (const sentence of sentences.length > 0 ? sentences : [text]) {
    if (sentence.length <= maxLength) {
      chunks.push(sentence);
      continue;
    }

    for (let i = 0; i < sentence.length; i += maxLength) {
      chunks.push(sentence.slice(i, i + maxLength));
    }
  }

  return chunks;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function normalizeSpeechText(text: string): string {
  return stripMarkdownForSpeech(text).slice(0, 4000);
}

export function useVoiceTA(onTranscriptReady?: (transcript: string) => void): VoiceControls {
  const settings = isBrowser ? loadSettings() : null;

  const [state, setState] = useState<VoiceState>(() => ({
    mode: "idle",
    transcript: "",
    captions: "",
    error: null,
    supported: false,
    sttSupported: false,
    ttsSupported: false,
    ttsStatus: null,
    soundEnabled: true,
    nativeVoiceModeEnabled: true,
    transcriptHistory: [],
    voiceSpeed: settings?.talkingSpeed ?? 1,
  }));

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioQueueRef = useRef<SpeechAudio[]>([]);
  const pendingSpeechTextRef = useRef<string[]>([]);
  const processingSpeechQueueRef = useRef(false);
  const queuedSpeechTextRef = useRef<Set<string>>(new Set());
  const ttsQuotaBlockedRef = useRef(false);
  const cachedAudioRef = useRef<SpeechAudio | null>(null);
  const preloadRequestRef = useRef<string | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const errorTimerRef = useRef<unknown>(null);
  const silenceTimerRef = useRef<unknown>(null);
  const speechStartTimerRef = useRef<number | null>(null);
  const finalizingRef = useRef(false);
  const nativeVoiceModeRef = useRef(state.nativeVoiceModeEnabled);
  const soundEnabledRef = useRef(state.soundEnabled);

  useEffect(() => {
    nativeVoiceModeRef.current = state.nativeVoiceModeEnabled;
  }, [state.nativeVoiceModeEnabled]);

  useEffect(() => {
    soundEnabledRef.current = state.soundEnabled;
  }, [state.soundEnabled]);

  useEffect(() => {
    const sttSupported = getSpeechRecognitionClass() !== undefined;
    const ttsSupported = isSpeechSynthesisSupported();
    setState((prev) => ({
      ...prev,
      sttSupported,
      ttsSupported,
      supported: sttSupported && ttsSupported,
      ttsStatus: ttsSupported
        ? `Browser TTS ready; voices loaded: ${window.speechSynthesis.getVoices().length}`
        : "Browser TTS is not supported here.",
    }));
  }, []);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setState((prev) => ({
        ...prev,
        ttsStatus: `Browser TTS ready; voices loaded: ${voices.length}`,
      }));
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearCachedAudio = useCallback(() => {
    const cachedAudio = cachedAudioRef.current;
    if (cachedAudio && cachedAudio.audioUrl !== audioUrlRef.current) {
      URL.revokeObjectURL(cachedAudio.audioUrl);
    }
    cachedAudioRef.current = null;
  }, []);

  const stopGeneratedAudio = useCallback(() => {
    audioElementRef.current?.pause();
    audioElementRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleClearVoiceData = () => {
      clearSilenceTimer();
      finalTranscriptRef.current = "";
      setState((prev) => ({
        ...prev,
        transcript: "",
        captions: "",
        transcriptHistory: [],
      }));
    };

    window.addEventListener("stepwise:clear-voice-data", handleClearVoiceData);
    const queuedSpeechText = queuedSpeechTextRef.current;

    return () => {
      window.removeEventListener("stepwise:clear-voice-data", handleClearVoiceData);
      recognitionRef.current?.abort();
      stopGeneratedAudio();
      audioQueueRef.current.forEach((audio) => URL.revokeObjectURL(audio.audioUrl));
      audioQueueRef.current = [];
      pendingSpeechTextRef.current = [];
      processingSpeechQueueRef.current = false;
      queuedSpeechText.clear();
      ttsQuotaBlockedRef.current = false;
      clearCachedAudio();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current as ReturnType<typeof setTimeout>);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      if (speechStartTimerRef.current) clearTimeout(speechStartTimerRef.current);
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, [clearCachedAudio, clearSilenceTimer, stopGeneratedAudio]);

  const fetchSpeechAudio = useCallback(async (spokenText: string): Promise<SpeechAudio> => {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      const error = new Error(data?.error ?? `TTS request failed: ${response.status}`);
      error.name = response.status === 429 ? "TTSQuotaError" : "TTSError";
      throw error;
    }

    const data = (await response.json()) as {
      audioData?: string;
      mimeType?: string;
      model?: string;
    };

    if (!data.audioData) {
      throw new Error("TTS route returned no audio data.");
    }

    const mimeType = data.mimeType ?? "audio/wav";
    return {
      audioUrl: base64ToBlobUrl(data.audioData, mimeType),
      mimeType,
      model: data.model,
      text: spokenText,
    };
  }, []);

  const playSpeechAudio = useCallback((speechAudio: SpeechAudio) => {
    stopGeneratedAudio();

    const audio = new Audio(speechAudio.audioUrl);
    audioElementRef.current = audio;
    audioUrlRef.current = speechAudio.audioUrl;
    audio.playbackRate = Math.max(0.5, Math.min(2.0, loadSettings().talkingSpeed ?? 1));
    audio.onplaying = () => {
      setState((prev) => ({
        ...prev,
        mode: "speaking",
        error: null,
        ttsStatus: `Playing Gemini speech audio${speechAudio.model ? ` (${speechAudio.model})` : ""}.`,
      }));
    };
    audio.onended = () => {
      stopGeneratedAudio();
      const nextAudio = audioQueueRef.current.shift();
      if (nextAudio) {
        playSpeechAudio(nextAudio);
        return;
      }

      setState((prev) => ({
        ...prev,
        mode: "idle",
        ttsStatus: ttsQuotaBlockedRef.current
          ? "Gemini TTS quota reached; text response will continue without audio."
          : "Finished Gemini speech audio.",
      }));
    };
    audio.onerror = () => {
      stopGeneratedAudio();
      audioQueueRef.current.forEach((queuedAudio) => URL.revokeObjectURL(queuedAudio.audioUrl));
      audioQueueRef.current = [];
      queuedSpeechTextRef.current.clear();
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Generated speech audio could not be played.",
        ttsStatus: "Generated speech audio could not be played.",
      }));
    };

    void audio.play().catch((err: unknown) => {
      stopGeneratedAudio();
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: err instanceof Error ? err.message : "Generated speech audio could not be played.",
        ttsStatus:
          err instanceof Error ? `Generated speech audio could not be played: ${err.message}` : "Generated speech audio could not be played.",
      }));
    });
  }, [stopGeneratedAudio]);

  const processSpeechQueue = useCallback(async () => {
    if (processingSpeechQueueRef.current) return;
    processingSpeechQueueRef.current = true;

    try {
      while (
        pendingSpeechTextRef.current.length > 0 &&
        soundEnabledRef.current &&
        !ttsQuotaBlockedRef.current
      ) {
        const spokenText = pendingSpeechTextRef.current.shift();
        if (!spokenText) continue;

        setState((prev) => ({
          ...prev,
          ttsStatus: "Preparing live response audio...",
        }));

        try {
          const speechAudio = await fetchSpeechAudio(spokenText);
          queuedSpeechTextRef.current.delete(spokenText);

          if (!soundEnabledRef.current) {
            URL.revokeObjectURL(speechAudio.audioUrl);
            continue;
          }

          setState((prev) => ({
            ...prev,
            mode: "speaking",
            error: null,
            soundEnabled: true,
            ttsStatus: "Live response audio ready.",
          }));

          if (audioElementRef.current) {
            audioQueueRef.current.push(speechAudio);
          } else {
            playSpeechAudio(speechAudio);
          }
        } catch (err) {
          queuedSpeechTextRef.current.delete(spokenText);
          if (
            err instanceof Error &&
            (err.name === "TTSQuotaError" || /quota|429|rate limit/i.test(err.message))
          ) {
            ttsQuotaBlockedRef.current = true;
            pendingSpeechTextRef.current = [];
            queuedSpeechTextRef.current.clear();
            setState((prev) => ({
              ...prev,
              ttsStatus:
                "Gemini TTS quota reached; text response will continue without audio.",
            }));
            break;
          }

          setState((prev) => ({
            ...prev,
            ttsStatus:
              err instanceof Error
                ? `Gemini live TTS failed: ${err.message}`
                : "Gemini live TTS failed.",
          }));
        }
      }
    } finally {
      processingSpeechQueueRef.current = false;
    }
  }, [fetchSpeechAudio, playSpeechAudio]);

  const enqueueSpeech = useCallback(
    (text: string) => {
      const spokenText = normalizeSpeechText(text);
      if (!spokenText || !soundEnabledRef.current || ttsQuotaBlockedRef.current) return;
      if (queuedSpeechTextRef.current.has(spokenText)) return;

      queuedSpeechTextRef.current.add(spokenText);
      pendingSpeechTextRef.current.push(spokenText);
      void processSpeechQueue();
    },
    [processSpeechQueue]
  );

  const preloadSpeech = useCallback(
    async (text: string) => {
      const spokenText = normalizeSpeechText(text);
      if (!spokenText) return;
      if (cachedAudioRef.current?.text === spokenText) return;
      if (preloadRequestRef.current === spokenText) return;

      preloadRequestRef.current = spokenText;
      setState((prev) => ({
        ...prev,
        ttsStatus: "Preparing Gemini speech audio...",
      }));

      try {
        const speechAudio = await fetchSpeechAudio(spokenText);
        if (preloadRequestRef.current !== spokenText) {
          URL.revokeObjectURL(speechAudio.audioUrl);
          return;
        }

        clearCachedAudio();
        cachedAudioRef.current = speechAudio;
        setState((prev) => ({
          ...prev,
          ttsStatus: `Gemini speech audio ready${speechAudio.model ? ` (${speechAudio.model})` : ""}.`,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          ttsStatus:
            err instanceof Error
              ? `Gemini TTS preload failed: ${err.message}`
              : "Gemini TTS preload failed.",
        }));
      } finally {
        if (preloadRequestRef.current === spokenText) {
          preloadRequestRef.current = null;
        }
      }
    },
    [clearCachedAudio, fetchSpeechAudio]
  );

  const finalizeTurn = useCallback(() => {
    const transcript = finalTranscriptRef.current.trim();
    if (!transcript) {
      clearSilenceTimer();
      setState((prev) => ({ ...prev, mode: "idle" }));
      return;
    }

    if (finalizingRef.current) return;
    finalizingRef.current = true;
    clearSilenceTimer();

    const entry = createTranscriptEntry("user", transcript);
    setState((prev) => ({
      ...prev,
      mode: "idle",
      transcript,
      transcriptHistory: [...prev.transcriptHistory, entry],
    }));

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    finalTranscriptRef.current = "";

    if (nativeVoiceModeRef.current && onTranscriptReady) {
      onTranscriptReady(transcript);
    }

    window.setTimeout(() => {
      finalizingRef.current = false;
    }, 150);
  }, [clearSilenceTimer, onTranscriptReady]);

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Speech recognition is not supported in this browser.",
      }));
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();

    clearSilenceTimer();
    finalTranscriptRef.current = "";
    finalizingRef.current = false;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

      recognition.onstart = () => {
        setState((prev) => ({
          ...prev,
          mode: "listening",
          transcript: "",
          error: null,
          sttSupported: true,
        }));
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        let hasSpeech = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscriptRef.current += `${result[0].transcript} `;
            hasSpeech = true;
          } else {
            interimTranscript += result[0].transcript;
            hasSpeech = true;
          }
        }

        if (hasSpeech) {
          if (isSpeechSynthesisSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
            window.speechSynthesis.cancel();
            utteranceRef.current = null;
          }

          const liveTranscript = `${finalTranscriptRef.current}${interimTranscript}`.trim();
          setState((prev) => ({
            ...prev,
            mode: "listening",
            transcript: liveTranscript,
          }));

          clearSilenceTimer();
          silenceTimerRef.current = window.setTimeout(() => {
            finalizeTurn();
          }, 1800);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "aborted") return;

        const errorMessage =
          event.error === "no-speech"
            ? "No speech detected. Please try again."
            : event.error === "audio-capture"
            ? "Microphone not found. Check your browser permissions."
            : event.error === "not-allowed"
            ? "Microphone access denied. Allow access in your browser settings."
            : event.error === "network"
            ? "Speech service unavailable. Check your internet connection and try again."
            : `Speech recognition error: ${event.error}`;

        setState((prev) => ({ ...prev, mode: "error", error: errorMessage }));

        if (errorTimerRef.current) clearTimeout(errorTimerRef.current as ReturnType<typeof setTimeout>);
        errorTimerRef.current = setTimeout(() => {
          setState((prev) =>
            prev.mode === "error" ? { ...prev, mode: "idle", error: null } : prev
          );
        }, 4000);
      };

      recognition.onend = () => {
        setState((prev) => ({
          ...prev,
          mode: "idle",
          transcript: finalTranscriptRef.current.trim() || prev.transcript,
        }));
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error:
          err instanceof Error
            ? err.message
            : "Failed to start speech recognition.",
      }));
    }
  }, [clearSilenceTimer, finalizeTurn]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [clearSilenceTimer]);

  const speak = useCallback(async (text: string) => {
    if (!isSpeechSynthesisSupported()) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Speech synthesis is not supported in this browser.",
        ttsStatus: "Browser TTS is not supported here.",
      }));
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    clearSilenceTimer();
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

    const spokenText = normalizeSpeechText(text);
    if (!spokenText) {
      setState((prev) => ({
        ...prev,
        ttsStatus: "Read request received, but there was no readable text.",
      }));
      return;
    }

    try {
      stopGeneratedAudio();
      audioQueueRef.current.forEach((audio) => URL.revokeObjectURL(audio.audioUrl));
      audioQueueRef.current = [];
      pendingSpeechTextRef.current = [];
      queuedSpeechTextRef.current.clear();
      ttsQuotaBlockedRef.current = false;

      const entry = createTranscriptEntry("assistant", spokenText);
      const cachedAudio =
        cachedAudioRef.current?.text === spokenText ? cachedAudioRef.current : null;
      if (cachedAudio) {
        cachedAudioRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        mode: "speaking",
        error: null,
        soundEnabled: true,
        ttsStatus: cachedAudio
          ? "Starting prepared Gemini speech audio..."
          : "Generating Gemini speech audio...",
        transcriptHistory: [...prev.transcriptHistory, entry],
      }));

      const speechAudio = cachedAudio ?? (await fetchSpeechAudio(spokenText));
      playSpeechAudio(speechAudio);
      return;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        mode: "speaking",
        ttsStatus: `${
          err instanceof Error ? err.message : "Gemini TTS failed"
        }; falling back to browser TTS.`,
      }));
    }

    const chunks = splitSpeechIntoChunks(spokenText);
    if (chunks.length === 0) {
      setState((prev) => ({
        ...prev,
        ttsStatus: "Read request received, but no speech chunks were created.",
      }));
      return;
    }

    const settings = loadSettings();
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? null;

    const createUtterance = (chunk: string) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = preferredVoice?.lang ?? "en-US";
      utterance.voice = preferredVoice;
      utterance.rate = Math.max(0.5, Math.min(2.0, settings.talkingSpeed ?? 1));
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      return utterance;
    };

    const speakQueuedChunk = () => {
      const utterance = utteranceQueueRef.current.shift();
      if (!utterance) {
        utteranceRef.current = null;
        if (speechStartTimerRef.current) {
          clearTimeout(speechStartTimerRef.current);
          speechStartTimerRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          mode: "idle",
          ttsStatus: "Finished reading aloud.",
        }));
        return;
      }

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume();
    };

    const utterances = chunks.map((chunk) => {
      const utterance = createUtterance(chunk);
      utterance.onstart = () => {
        if (speechStartTimerRef.current) {
          clearTimeout(speechStartTimerRef.current);
          speechStartTimerRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          mode: "speaking",
          error: null,
          ttsStatus: `Speech started with ${utterance.voice?.name ?? "default voice"}.`,
        }));
      };

      utterance.onend = () => {
        speakQueuedChunk();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (speechStartTimerRef.current) {
          clearTimeout(speechStartTimerRef.current);
          speechStartTimerRef.current = null;
        }

        if (event.error === "interrupted" || event.error === "canceled") {
          utteranceQueueRef.current = [];
          utteranceRef.current = null;
          setState((prev) => ({
            ...prev,
            mode: "idle",
            ttsStatus: `Speech ${event.error}.`,
          }));
          return;
        }

        utteranceQueueRef.current = [];
        utteranceRef.current = null;
        setState((prev) => ({
          ...prev,
          mode: "error",
          error: `Speech synthesis error: ${event.error}`,
          ttsStatus: `Speech synthesis error: ${event.error}`,
        }));
      };

      return utterance;
    });

    if (utterances.length === 0) return;

    utteranceQueueRef.current = utterances;

    const retryFirstChunk = () => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        return;
      }

      setState((prev) => ({
        ...prev,
        ttsStatus: "Speech did not start; retrying browser TTS once.",
      }));

      utteranceQueueRef.current = chunks.map((chunk) => {
        const utterance = createUtterance(chunk);
        utterance.onstart = utterances[0].onstart;
        utterance.onend = () => speakQueuedChunk();
        utterance.onerror = utterances[0].onerror;
        return utterance;
      });

      speakQueuedChunk();
    };

    const entry = createTranscriptEntry("assistant", spokenText);
    soundEnabledRef.current = true;
    setState((prev) => ({
      ...prev,
      mode: "speaking",
      error: null,
      soundEnabled: true,
      ttsStatus: `Read request queued: ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}, ${voices.length} voice${voices.length === 1 ? "" : "s"} available.`,
      transcriptHistory: [...prev.transcriptHistory, entry],
    }));

    speakQueuedChunk();
    speechStartTimerRef.current = window.setTimeout(retryFirstChunk, 600);
  }, [clearSilenceTimer, fetchSpeechAudio, playSpeechAudio, stopGeneratedAudio]);

  const cancelSpeech = useCallback(() => {
    stopGeneratedAudio();
    audioQueueRef.current.forEach((audio) => URL.revokeObjectURL(audio.audioUrl));
    audioQueueRef.current = [];
    pendingSpeechTextRef.current = [];
    queuedSpeechTextRef.current.clear();
    ttsQuotaBlockedRef.current = false;
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    utteranceQueueRef.current = [];
    if (speechStartTimerRef.current) {
      clearTimeout(speechStartTimerRef.current);
      speechStartTimerRef.current = null;
    }
    utteranceRef.current = null;
    setState((prev) => ({ ...prev, mode: "idle" }));
  }, [stopGeneratedAudio]);

  const toggleSound = useCallback(() => {
    setState((prev) => {
      const nextSoundEnabled = !prev.soundEnabled;
      soundEnabledRef.current = nextSoundEnabled;
      saveSettings({ ttsEnabled: nextSoundEnabled });

      if (!nextSoundEnabled) {
        stopGeneratedAudio();
        audioQueueRef.current.forEach((audio) => URL.revokeObjectURL(audio.audioUrl));
        audioQueueRef.current = [];
        pendingSpeechTextRef.current = [];
        queuedSpeechTextRef.current.clear();
        ttsQuotaBlockedRef.current = false;
        if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
        if (speechStartTimerRef.current) {
          clearTimeout(speechStartTimerRef.current);
          speechStartTimerRef.current = null;
        }
        utteranceRef.current = null;
      } else {
        ttsQuotaBlockedRef.current = false;
      }

      return {
        ...prev,
        soundEnabled: nextSoundEnabled,
        mode: nextSoundEnabled ? prev.mode : "idle",
      };
    });
  }, [stopGeneratedAudio]);

  const toggleNativeVoiceMode = useCallback(() => {
    setState((prev) => ({ ...prev, nativeVoiceModeEnabled: !prev.nativeVoiceModeEnabled }));
  }, []);

  const setVoiceSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.max(0.5, Math.min(2.0, speed));
    saveSettings({ talkingSpeed: nextSpeed });
    if (audioElementRef.current) {
      audioElementRef.current.playbackRate = nextSpeed;
    }
    setState((prev) => ({ ...prev, voiceSpeed: nextSpeed }));
  }, []);

  const clearTranscriptHistory = useCallback(() => {
    finalTranscriptRef.current = "";
    setState((prev) => ({
      ...prev,
      transcript: "",
      transcriptHistory: [],
    }));
  }, []);

  return {
    state,
    startListening,
    stopListening,
    speak,
    preloadSpeech,
    enqueueSpeech,
    cancelSpeech,
    toggleSound,
    toggleNativeVoiceMode,
    setVoiceSpeed,
    clearTranscriptHistory,
  };
}
