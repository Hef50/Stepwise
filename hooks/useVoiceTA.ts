"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { stripMarkdownForSpeech } from "@/lib/speech";
import type {
  VoiceControls,
  VoiceMode,
  VoiceState,
  VoiceTranscriptEntry,
} from "@/lib/types";

const isBrowser = typeof window !== "undefined";
const SPEECH_START_TIMEOUT_MS = 1200;
const SPEECH_START_RETRIES = 2;

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
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const pendingSpeechTextRef = useRef<string[]>([]);
  const queuedSpeechTextRef = useRef<Set<string>>(new Set());
  const processingSpeechQueueRef = useRef(false);
  const speechStartTimerRef = useRef<number | null>(null);
  const finalTranscriptRef = useRef("");
  const errorTimerRef = useRef<unknown>(null);
  const silenceTimerRef = useRef<unknown>(null);
  const finalizingRef = useRef(false);
  const speechUnlockedRef = useRef(false);
  const speechRunIdRef = useRef(0);
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

  const clearSpeechStartTimer = useCallback(() => {
    if (speechStartTimerRef.current) {
      clearTimeout(speechStartTimerRef.current);
      speechStartTimerRef.current = null;
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
      silenceTimerRef.current = null;
    }
  }, []);

  const unlockSpeech = useCallback(() => {
    if (!isSpeechSynthesisSupported()) return;
    speechUnlockedRef.current = true;
    window.speechSynthesis.resume();
  }, []);

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
    if (!isSpeechSynthesisSupported()) return;

    const handleUserActivation = () => unlockSpeech();
    window.addEventListener("pointerdown", handleUserActivation, { capture: true });
    window.addEventListener("keydown", handleUserActivation, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserActivation, { capture: true });
      window.removeEventListener("keydown", handleUserActivation, { capture: true });
    };
  }, [unlockSpeech]);

  const cancelBrowserSpeech = useCallback(() => {
    speechRunIdRef.current += 1;
    clearSpeechStartTimer();
    utteranceQueueRef.current = [];
    utteranceRef.current = null;
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
  }, [clearSpeechStartTimer]);

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
      pendingSpeechTextRef.current = [];
      processingSpeechQueueRef.current = false;
      queuedSpeechText.clear();
      cancelBrowserSpeech();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current as ReturnType<typeof setTimeout>);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current as ReturnType<typeof setTimeout>);
    };
  }, [cancelBrowserSpeech, clearSilenceTimer]);

  const speakBrowserText = useCallback(
    (spokenText: string, statusPrefix = "Browser speech"): Promise<void> => {
      if (!isSpeechSynthesisSupported() || !soundEnabledRef.current) {
        setState((prev) => ({
          ...prev,
          mode: isSpeechSynthesisSupported() ? prev.mode : "error",
          error: isSpeechSynthesisSupported()
            ? prev.error
            : "Speech synthesis is not supported in this browser.",
          ttsStatus: isSpeechSynthesisSupported()
            ? "Speech canceled."
            : "Browser speech is not supported here.",
        }));
        return Promise.resolve();
      }

      const chunks = splitSpeechIntoChunks(spokenText);
      if (chunks.length === 0) return Promise.resolve();

      cancelBrowserSpeech();
      unlockSpeech();

      const voices = window.speechSynthesis.getVoices();
      const runId = speechRunIdRef.current + 1;
      speechRunIdRef.current = runId;

      return new Promise((resolve) => {
        let settled = false;
        let currentChunkStarted = false;
        let startAttempt = 0;
        let suppressNextCancelEvent = false;

        const finish = (mode: VoiceMode, ttsStatus: string, error: string | null = null) => {
          if (speechRunIdRef.current !== runId) {
            resolve();
            return;
          }
          if (settled) return;
          settled = true;
          utteranceQueueRef.current = [];
          utteranceRef.current = null;
          clearSpeechStartTimer();
          setState((prev) => ({
            ...prev,
            mode,
            error,
            ttsStatus,
          }));
          resolve();
        };

        const createUtterance = (chunk: string) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = "en-US";
          utterance.rate = Math.max(0.5, Math.min(2.0, voiceSpeedRef.current));
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          return utterance;
        };

        const retryIfSpeechDoesNotStart = () => {
          if (speechRunIdRef.current !== runId) {
            resolve();
            return;
          }
          if (settled || currentChunkStarted || !utteranceRef.current) return;

          if (startAttempt >= SPEECH_START_RETRIES) {
            finish(
              "error",
              "Browser speech could not start. Click the volume button once, then try again.",
              "Browser speech could not start."
            );
            return;
          }

          startAttempt += 1;
          const retryText = utteranceRef.current.text;
          setState((prev) => ({
            ...prev,
            ttsStatus: `Browser speech did not start; retrying (${startAttempt}/${SPEECH_START_RETRIES}).`,
          }));

          suppressNextCancelEvent = true;
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          const retryUtterance = createUtterance(retryText);
          retryUtterance.onstart = utteranceRef.current.onstart;
          retryUtterance.onend = utteranceRef.current.onend;
          retryUtterance.onerror = utteranceRef.current.onerror;
          utteranceRef.current = retryUtterance;

          window.setTimeout(() => {
            if (speechRunIdRef.current !== runId) return;
            if (settled || currentChunkStarted || utteranceRef.current !== retryUtterance) {
              return;
            }
            window.speechSynthesis.speak(retryUtterance);
            window.speechSynthesis.resume();
            clearSpeechStartTimer();
            speechStartTimerRef.current = window.setTimeout(
              retryIfSpeechDoesNotStart,
              SPEECH_START_TIMEOUT_MS
            );
          }, 250);
        };

        const speakQueuedChunk = () => {
          if (speechRunIdRef.current !== runId) {
            resolve();
            return;
          }
          if (!soundEnabledRef.current) {
            finish("idle", "Speech canceled.");
            return;
          }

          const utterance = utteranceQueueRef.current.shift();
          if (!utterance) {
            finish("idle", "Finished reading aloud.");
            return;
          }

          currentChunkStarted = false;
          startAttempt = 0;
          utteranceRef.current = utterance;
          if (speechRunIdRef.current !== runId) return;
          if (settled || utteranceRef.current !== utterance) return;
          window.speechSynthesis.speak(utterance);
          window.speechSynthesis.resume();
          clearSpeechStartTimer();
          speechStartTimerRef.current = window.setTimeout(
            retryIfSpeechDoesNotStart,
            SPEECH_START_TIMEOUT_MS
          );
        };

        const utterances = chunks.map((chunk) => {
          const utterance = createUtterance(chunk);
          utterance.onstart = () => {
            if (speechRunIdRef.current !== runId) return;
            currentChunkStarted = true;
            clearSpeechStartTimer();
            setState((prev) => ({
              ...prev,
              mode: "speaking",
              error: null,
              ttsStatus: "Speaking with browser voice.",
            }));
          };
          utterance.onend = speakQueuedChunk;
          utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
            if (speechRunIdRef.current !== runId) return;
            if (event.error === "interrupted" || event.error === "canceled") {
              if (suppressNextCancelEvent) {
                suppressNextCancelEvent = false;
                return;
              }
              finish("idle", `Speech ${event.error}.`);
              return;
            }

            finish(
              "error",
              `Browser speech error: ${event.error}`,
              `Browser speech error: ${event.error}`
            );
          };
          return utterance;
        });

        utteranceQueueRef.current = utterances;
        setState((prev) => ({
          ...prev,
          mode: "speaking",
          error: null,
          soundEnabled: true,
          ttsStatus: `${statusPrefix} queued: ${chunks.length} chunk${
            chunks.length === 1 ? "" : "s"
          }, ${voices.length} voice${voices.length === 1 ? "" : "s"} available${
            speechUnlockedRef.current ? "." : ". Click once anywhere if speech does not start."
          }`,
        }));

        speakQueuedChunk();
      });
    },
    [cancelBrowserSpeech, clearSpeechStartTimer, unlockSpeech]
  );

  const processSpeechQueue = useCallback(async () => {
    if (processingSpeechQueueRef.current) return;
    processingSpeechQueueRef.current = true;

    try {
      while (pendingSpeechTextRef.current.length > 0 && soundEnabledRef.current) {
        const spokenText = pendingSpeechTextRef.current.shift();
        if (!spokenText) continue;
        queuedSpeechTextRef.current.delete(spokenText);
        await speakBrowserText(spokenText, "Browser speech");
      }
    } finally {
      processingSpeechQueueRef.current = false;
    }
  }, [speakBrowserText]);

  const enqueueSpeech = useCallback(
    (text: string) => {
      const spokenText = normalizeSpeechText(text);
      if (!spokenText || !soundEnabledRef.current) return;
      if (queuedSpeechTextRef.current.has(spokenText)) return;

      queuedSpeechTextRef.current.add(spokenText);
      pendingSpeechTextRef.current.push(spokenText);
      void processSpeechQueue();
    },
    [processSpeechQueue]
  );

  const preloadSpeech = useCallback(() => {
    if (!isSpeechSynthesisSupported()) return;
    unlockSpeech();
    window.speechSynthesis.getVoices();
  }, [unlockSpeech]);

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
    unlockSpeech();

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

    cancelBrowserSpeech();
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
          cancelBrowserSpeech();

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
  }, [cancelBrowserSpeech, clearSilenceTimer, finalizeTurn, unlockSpeech]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [clearSilenceTimer]);

  const speak = useCallback(
    (text: string) => {
      unlockSpeech();

      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      clearSilenceTimer();
      pendingSpeechTextRef.current = [];
      queuedSpeechTextRef.current.clear();

      const spokenText = normalizeSpeechText(text);
      if (!spokenText) {
        setState((prev) => ({
          ...prev,
          ttsStatus: "Read request received, but there was no readable text.",
        }));
        return;
      }

      const entry = createTranscriptEntry("assistant", spokenText);
      soundEnabledRef.current = true;
      setState((prev) => ({
        ...prev,
        mode: "speaking",
        error: null,
        soundEnabled: true,
        ttsStatus: "Starting browser speech...",
        transcriptHistory: [...prev.transcriptHistory, entry],
      }));

      void speakBrowserText(spokenText, "Read request");
    },
    [clearSilenceTimer, speakBrowserText, unlockSpeech]
  );

  const cancelSpeech = useCallback(() => {
    pendingSpeechTextRef.current = [];
    queuedSpeechTextRef.current.clear();
    processingSpeechQueueRef.current = false;
    cancelBrowserSpeech();
    setState((prev) => ({ ...prev, mode: "idle", ttsStatus: "Speech canceled." }));
  }, [cancelBrowserSpeech]);

  const toggleSound = useCallback(() => {
    unlockSpeech();

    setState((prev) => {
      const nextSoundEnabled = !prev.soundEnabled;
      soundEnabledRef.current = nextSoundEnabled;
      saveSettings({ ttsEnabled: nextSoundEnabled });

      if (!nextSoundEnabled) {
        pendingSpeechTextRef.current = [];
        queuedSpeechTextRef.current.clear();
        processingSpeechQueueRef.current = false;
        cancelBrowserSpeech();
      } else {
        void processSpeechQueue();
      }

      return {
        ...prev,
        soundEnabled: nextSoundEnabled,
        mode: nextSoundEnabled ? prev.mode : "idle",
        ttsStatus: nextSoundEnabled ? "Browser speech unmuted." : "Browser speech muted.",
      };
    });
  }, [cancelBrowserSpeech, processSpeechQueue, unlockSpeech]);

  const toggleNativeVoiceMode = useCallback(() => {
    setState((prev) => ({ ...prev, nativeVoiceModeEnabled: !prev.nativeVoiceModeEnabled }));
  }, []);

  const setVoiceSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.max(0.5, Math.min(2.0, speed));
    saveSettings({ talkingSpeed: nextSpeed });
    voiceSpeedRef.current = nextSpeed;
    if (utteranceRef.current) {
      const currentText = utteranceRef.current.text;
      cancelBrowserSpeech();
      void speakBrowserText(currentText, "Restarting browser speech at new speed");
    }
    setState((prev) => ({ ...prev, voiceSpeed: nextSpeed }));
  }, [cancelBrowserSpeech, speakBrowserText]);

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
