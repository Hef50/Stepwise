"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "@/lib/settings";
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

export function useVoiceTA(onTranscriptReady?: (transcript: string) => void): VoiceControls {
  const [state, setState] = useState<VoiceState>(() => {
    const settings = isBrowser ? loadSettings() : null;
    return {
      mode: "idle",
      transcript: "",
      captions: "",
      error: null,
      supported: false,
      nativeVoiceModeEnabled: true,
      transcriptHistory: [],
      voiceSpeed: settings?.talkingSpeed ?? 1,
    };
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const errorTimerRef = useRef<unknown>(null);
  const silenceTimerRef = useRef<unknown>(null);
  const finalizingRef = useRef(false);
  const nativeVoiceModeRef = useRef(state.nativeVoiceModeEnabled);

  useEffect(() => {
    nativeVoiceModeRef.current = state.nativeVoiceModeEnabled;
  }, [state.nativeVoiceModeEnabled]);

  useEffect(() => {
    const supported =
      getSpeechRecognitionClass() !== undefined && isSpeechSynthesisSupported();
    setState((prev) => ({ ...prev, supported }));
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      silenceTimerRef.current = null;
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

    return () => {
      window.removeEventListener("stepwise:clear-voice-data", handleClearVoiceData);
      recognitionRef.current?.abort();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current as ReturnType<typeof setTimeout>);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, [clearSilenceTimer]);

  const finalizeTurn = useCallback(() => {
    const transcript = finalTranscriptRef.current.trim();
    if (!transcript) {
      clearSilenceTimer();
      setState((prev) => ({ ...prev, mode: "idle", captions: prev.captions || "Listening…" }));
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
      captions: transcript,
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
        captions: "Voice input unavailable",
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
          captions: "Listening…",
          error: null,
          supported: true,
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
            captions: liveTranscript || "Listening…",
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
          captions: finalTranscriptRef.current.trim() || prev.captions || "Listening…",
        }));
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        captions: "Voice input unavailable",
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

  const speak = useCallback((text: string) => {
    if (!isSpeechSynthesisSupported()) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Speech synthesis is not supported in this browser.",
      }));
      return;
    }

    const settings = loadSettings();
    if (!settings.ttsEnabled) {
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    clearSilenceTimer();
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = Math.max(0.5, Math.min(2.0, settings.talkingSpeed ?? 1));
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const entry = createTranscriptEntry("assistant", text);
    setState((prev) => ({
      ...prev,
      mode: "speaking",
      captions: text,
      error: null,
      transcriptHistory: [...prev.transcriptHistory, entry],
    }));

    utterance.onstart = () => {
      setState((prev) => ({ ...prev, mode: "speaking", error: null }));
    };

    utterance.onend = () => {
      setState((prev) => ({ ...prev, mode: "idle", captions: prev.captions || "Listening…" }));
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (event.error === "interrupted" || event.error === "canceled") {
        setState((prev) => ({ ...prev, mode: "idle", captions: prev.captions || "Listening…" }));
        return;
      }
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: `Speech synthesis error: ${event.error}`,
      }));
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [clearSilenceTimer]);

  const cancelSpeech = useCallback(() => {
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState((prev) => ({ ...prev, mode: "idle", captions: prev.captions || "Listening…" }));
  }, []);

  const toggleNativeVoiceMode = useCallback(() => {
    setState((prev) => ({ ...prev, nativeVoiceModeEnabled: !prev.nativeVoiceModeEnabled }));
  }, []);

  const setVoiceSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.max(0.5, Math.min(2.0, speed));
    saveSettings({ talkingSpeed: nextSpeed });
    setState((prev) => ({ ...prev, voiceSpeed: nextSpeed }));
  }, []);

  const clearTranscriptHistory = useCallback(() => {
    finalTranscriptRef.current = "";
    setState((prev) => ({
      ...prev,
      transcript: "",
      captions: "",
      transcriptHistory: [],
    }));
  }, []);

  return {
    state,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    toggleNativeVoiceMode,
    setVoiceSpeed,
    clearTranscriptHistory,
  };
}
