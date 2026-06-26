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
  const [state, setState] = useState<VoiceState>(() => ({
    mode: "idle",
    transcript: "",
    error: null,
    supported:
      isBrowser &&
      getSpeechRecognitionClass() !== undefined &&
      isSpeechSynthesisSupported(),
  }));

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
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

    try {
      // Cancel any in-progress speech
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();

      const SpeechRecognitionCtor = SpeechRecognitionClass;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, mode: "listening", error: null, transcript: "" }));
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setState((prev) => ({ ...prev, transcript }));
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setState((prev) => ({
          ...prev,
          mode: "error",
          error: `Speech recognition error: ${event.error}`,
        }));
      };

      recognition.onend = () => {
        setState((prev) => ({
          ...prev,
          mode: "idle",
        }));
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        mode: "error",
        error: err instanceof Error ? err.message : "Failed to start speech recognition",
      }));
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState((prev) => ({ ...prev, mode: "idle" }));
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
    recognitionRef.current?.abort();
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
