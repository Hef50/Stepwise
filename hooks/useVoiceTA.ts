"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceControls, VoiceState } from "@/lib/types";

/**
 * useVoiceTA — Provider-agnostic voice hook.
 *
 * Internally uses the native Web Speech API (SpeechRecognition + speechSynthesis).
 * The public interface (VoiceControls) is deliberately abstract so this
 * implementation can be replaced with OpenAI Whisper/TTS without touching any
 * component that consumes it.
 *
 * Swap point:
 *   1. Create a new hook file (e.g. useVoiceOpenAI.ts) that returns VoiceControls.
 *   2. Replace the import in ChatPanel.tsx from useVoiceTA -> useVoiceOpenAI.
 *   3. No other changes required.
 */

const isBrowser = typeof window !== "undefined";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

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

export function useVoiceTA(): VoiceControls {
  // Always start with supported: false so server and client render the same
  // initial HTML. The real capability check runs in useEffect (client-only).
  const [state, setState] = useState<VoiceState>({
    mode: "idle",
    transcript: "",
    error: null,
    supported: false,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Ref holds the accumulated final transcript so onend can emit it atomically
  // without depending on React state timing.
  const finalTranscriptRef = useRef<string>("");
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect browser support after mount to avoid SSR/hydration mismatch
  useEffect(() => {
    const supported =
      getSpeechRecognitionClass() !== undefined && isSpeechSynthesisSupported();
    setState((prev) => ({ ...prev, supported }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, []);

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

    // Abort any existing recognition session cleanly
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    // Cancel any in-progress TTS
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();

    finalTranscriptRef.current = "";

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setState({
          mode: "listening",
          transcript: "",
          error: null,
          supported: true,
        });
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Accumulate all final results in the ref; build a live combined string
        // (finals already captured + current interim) for real-time display.
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscriptRef.current += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const liveTranscript = finalTranscriptRef.current + interimTranscript;
        setState((prev) => ({ ...prev, transcript: liveTranscript }));
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // "aborted" fires when we deliberately stop — not a real error.
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

        // Auto-clear error after 4 seconds so the UI doesn't stay stuck
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => {
          setState((prev) =>
            prev.mode === "error" ? { ...prev, mode: "idle", error: null } : prev
          );
        }, 4000);
      };

      recognition.onend = () => {
        // Emit mode AND final transcript atomically in a single setState so
        // there is no render where mode is "idle" but transcript is still "".
        setState((prev) => ({
          ...prev,
          mode: "idle",
          transcript: finalTranscriptRef.current || prev.transcript,
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
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // .stop() triggers onend which will update state
      recognitionRef.current.stop();
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSpeechSynthesisSupported()) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: "Speech synthesis is not supported in this browser.",
      }));
      return;
    }

    // Stop recognition and any in-progress speech
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setState((prev) => ({ ...prev, mode: "speaking", error: null }));
    };

    utterance.onend = () => {
      setState((prev) => ({ ...prev, mode: "idle" }));
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (event.error === "interrupted" || event.error === "canceled") {
        setState((prev) => ({ ...prev, mode: "idle" }));
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
  }, []);

  const cancelSpeech = useCallback(() => {
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState((prev) => ({ ...prev, mode: "idle" }));
  }, []);

  return { state, startListening, stopListening, speak, cancelSpeech };
}
