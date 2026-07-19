"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { stripMarkdownForSpeech } from "@/lib/speech";
import type { VoiceControls, VoiceState, VoiceTranscriptEntry } from "@/lib/types";

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
    soundEnabled: settings?.ttsEnabled ?? true,
    nativeVoiceModeEnabled: true,
    transcriptHistory: [],
    voiceSpeed: settings?.talkingSpeed ?? 1,
  }));

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const finalTranscriptRef = useRef("");
  const errorTimerRef = useRef<unknown>(null);
  const silenceTimerRef = useRef<unknown>(null);
  const speakTimerRef = useRef<unknown>(null);
  const heartbeatRef = useRef<unknown>(null);
  const finalizingRef = useRef(false);
  const nativeVoiceModeRef = useRef(state.nativeVoiceModeEnabled);
  const soundEnabledRef = useRef(state.soundEnabled);
  const voiceSpeedRef = useRef(state.voiceSpeed);

  useEffect(() => {
    nativeVoiceModeRef.current = state.nativeVoiceModeEnabled;
  }, [state.nativeVoiceModeEnabled]);

  useEffect(() => {
    soundEnabledRef.current = state.soundEnabled;
  }, [state.soundEnabled]);

  useEffect(() => {
    voiceSpeedRef.current = state.voiceSpeed;
  }, [state.voiceSpeed]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current as ReturnType<typeof setInterval>);
      heartbeatRef.current = null;
    }
  }, []);

  const clearSpeakTimer = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current as ReturnType<typeof setTimeout>);
      speakTimerRef.current = null;
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    clearSpeakTimer();
    clearHeartbeat();
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
    utteranceRef.current = null;
    setState((prev) => ({ ...prev, mode: "idle", ttsStatus: "Speech canceled." }));
  }, [clearHeartbeat, clearSpeakTimer]);

  useEffect(() => {
    const sttSupported = getSpeechRecognitionClass() !== undefined;
    const ttsSupported = isSpeechSynthesisSupported();
    setState((prev) => ({
      ...prev,
      sttSupported,
      ttsSupported,
      supported: sttSupported && ttsSupported,
      ttsStatus: ttsSupported
        ? `Browser speech ready; voices loaded: ${window.speechSynthesis.getVoices().length}`
        : "Browser speech is not supported here.",
    }));
  }, []);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setState((prev) => ({
        ...prev,
        ttsStatus: `Browser speech ready; voices loaded: ${voices.length}`,
      }));
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
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
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current as ReturnType<typeof setTimeout>);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current as ReturnType<typeof setTimeout>);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current as ReturnType<typeof setInterval>);
    };
  }, [clearSilenceTimer]);

  const speak = useCallback((text: string) => {
    if (!isSpeechSynthesisSupported()) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Speech synthesis is not supported in this browser.",
        ttsStatus: "Browser speech is not supported here.",
      }));
      return;
    }

    const spokenText = normalizeSpeechText(text);
    if (!spokenText) {
      setState((prev) => ({
        ...prev,
        ttsStatus: "Read request received, but there was no readable text.",
      }));
      return;
    }

    recognitionRef.current?.abort();
    recognitionRef.current = null;
    clearSilenceTimer();
    clearHeartbeat();
    clearSpeakTimer();

    // IMPORTANT: cancel() then speak() in the same tick silently no-ops in
    // Chrome (no error, no onstart, nothing audible). Cancel now, defer the
    // actual speak() to the next tick so the engine flushes the cancel first.
    window.speechSynthesis.cancel();

    speakTimerRef.current = window.setTimeout(() => {
      speakTimerRef.current = null;

      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = Math.max(0.5, Math.min(2.0, voiceSpeedRef.current));
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        // Chrome silently pauses/kills utterances after ~15s unless nudged
        // periodically with pause()/resume().
        clearHeartbeat();
        heartbeatRef.current = window.setInterval(() => {
          if (!isSpeechSynthesisSupported()) return;
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }, 5000);

        setState((prev) => ({
          ...prev,
          mode: "speaking",
          error: null,
          soundEnabled: true,
          ttsStatus: "Speaking with browser speech.",
        }));
      };

      utterance.onend = () => {
        clearHeartbeat();
        utteranceRef.current = null;
        setState((prev) => ({
          ...prev,
          mode: "idle",
          error: null,
          ttsStatus: "Finished reading aloud.",
        }));
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        clearHeartbeat();
        utteranceRef.current = null;
        if (event.error === "interrupted" || event.error === "canceled") {
          setState((prev) => ({
            ...prev,
            mode: "idle",
            ttsStatus: `Speech ${event.error}.`,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          mode: "error",
          error: `Browser speech error: ${event.error}`,
          ttsStatus: `Browser speech error: ${event.error}`,
        }));
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume();
    }, 50);

    soundEnabledRef.current = true;
    saveSettings({ ttsEnabled: true });
    setState((prev) => ({
      ...prev,
      mode: "speaking",
      error: null,
      soundEnabled: true,
      ttsStatus: "Starting browser speech.",
      transcriptHistory: [
        ...prev.transcriptHistory,
        createTranscriptEntry("assistant", spokenText),
      ],
    }));
  }, [clearHeartbeat, clearSilenceTimer, clearSpeakTimer]);

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

    recognitionRef.current?.abort();
    recognitionRef.current = null;
    cancelSpeech();
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

        if (!hasSpeech) return;

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
  }, [cancelSpeech, clearSilenceTimer, finalizeTurn]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  // Kept accepting an optional arg since ChatPanel calls this with `input`;
  // it's unused, just resumes/primes the browser speech engine.
  const preloadSpeech = useCallback((_text?: string) => {
    if (!isSpeechSynthesisSupported()) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.getVoices();
  }, []);

  const enqueueSpeech = useCallback(
    (text: string) => {
      if (!soundEnabledRef.current) return;
      speak(text);
    },
    [speak]
  );

  const toggleSound = useCallback(() => {
    setState((prev) => {
      const nextSoundEnabled = !prev.soundEnabled;
      soundEnabledRef.current = nextSoundEnabled;
      saveSettings({ ttsEnabled: nextSoundEnabled });

      if (!nextSoundEnabled && isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
        clearHeartbeat();
        clearSpeakTimer();
        utteranceRef.current = null;
      }

      return {
        ...prev,
        soundEnabled: nextSoundEnabled,
        mode: nextSoundEnabled ? prev.mode : "idle",
        ttsStatus: nextSoundEnabled ? "Browser speech unmuted." : "Browser speech muted.",
      };
    });
  }, [clearHeartbeat, clearSpeakTimer]);

  const toggleNativeVoiceMode = useCallback(() => {
    setState((prev) => ({ ...prev, nativeVoiceModeEnabled: !prev.nativeVoiceModeEnabled }));
  }, []);

  const setVoiceSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.max(0.5, Math.min(2.0, speed));
    saveSettings({ talkingSpeed: nextSpeed });
    voiceSpeedRef.current = nextSpeed;
    if (utteranceRef.current) {
      utteranceRef.current.rate = nextSpeed;
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