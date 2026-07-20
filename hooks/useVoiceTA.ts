"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadVoiceSettings, saveVoiceSettings } from "@/lib/settings";
import { stripMarkdownForSpeech } from "@/lib/speech";
import type { VoiceControls, VoiceState } from "@/lib/types";

const isBrowser = typeof window !== "undefined";
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => RecognitionInstance;

function getRecognition(): SpeechRecognitionConstructor | undefined {
  if (!isBrowser) return undefined;
  const browser = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

function hasTts() {
  return isBrowser && "speechSynthesis" in window;
}

function initialState(): VoiceState {
  return {
    mode: "idle",
    transcript: "",
    error: null,
    supported: false,
    sttSupported: false,
    ttsSupported: false,
    soundEnabled: true,
    voiceSpeed: 1,
    ttsStatus: null,
  };
}

/** Browser STT/TTS adapter used by Text and Mixed modes. */
export function useVoiceTA(onTranscriptReady?: (text: string) => void): VoiceControls {
  const [state, setState] = useState<VoiceState>(initialState);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const soundEnabledRef = useRef(true);
  const speedRef = useRef(1);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const transcriptCallbackRef = useRef(onTranscriptReady);

  useEffect(() => {
    transcriptCallbackRef.current = onTranscriptReady;
  }, [onTranscriptReady]);

  useEffect(() => {
    const sttSupported = Boolean(getRecognition());
    const ttsSupported = hasTts();
    const settings = loadVoiceSettings();
    soundEnabledRef.current = settings.ttsEnabled;
    speedRef.current = settings.talkingSpeed;
    setState((previous) => ({
      ...previous,
      supported: sttSupported || ttsSupported,
      sttSupported,
      ttsSupported,
      soundEnabled: settings.ttsEnabled,
      voiceSpeed: settings.talkingSpeed,
    }));
  }, []);

  const cancelSpeech = useCallback(() => {
    queueRef.current = [];
    speakingRef.current = false;
    if (hasTts()) window.speechSynthesis.cancel();
    setState((previous) =>
      previous.mode === "speaking" ? { ...previous, mode: "idle", ttsStatus: null } : previous
    );
  }, []);

  const speakNext = useCallback(() => {
    if (!hasTts() || !soundEnabledRef.current || speakingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(next));
    utterance.lang = "en-US";
    utterance.rate = speedRef.current;
    utterance.onstart = () =>
      setState((previous) => ({ ...previous, mode: "speaking", error: null, ttsStatus: "Speaking" }));
    utterance.onend = () => {
      speakingRef.current = false;
      setState((previous) => ({ ...previous, mode: "idle", ttsStatus: null }));
      speakNext();
    };
    utterance.onerror = (event) => {
      speakingRef.current = false;
      if (event.error === "interrupted" || event.error === "canceled") {
        setState((previous) => ({ ...previous, mode: "idle", ttsStatus: null }));
      } else {
        setState((previous) => ({ ...previous, mode: "error", error: `Speech synthesis error: ${event.error}`, ttsStatus: null }));
      }
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const enqueueSpeech = useCallback(
    (text: string) => {
      if (!text.trim() || !soundEnabledRef.current) return;
      queueRef.current.push(text);
      speakNext();
    },
    [speakNext]
  );

  const speak = useCallback(
    (text: string) => {
      if (!hasTts()) {
        setState((previous) => ({ ...previous, mode: "error", error: "Speech synthesis is not supported in this browser." }));
        return;
      }
      if (!soundEnabledRef.current) {
        soundEnabledRef.current = true;
        saveVoiceSettings({ ttsEnabled: true });
        setState((previous) => ({ ...previous, soundEnabled: true }));
      }
      cancelSpeech();
      queueRef.current = [text];
      speakNext();
    },
    [cancelSpeech, speakNext]
  );

  const startListening = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition) {
      setState((previous) => ({ ...previous, mode: "error", error: "Speech recognition is not supported in this browser." }));
      return;
    }
    cancelSpeech();
    recognitionRef.current?.abort();
    finalTranscriptRef.current = "";
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setState((previous) => ({ ...previous, mode: "listening", transcript: "", error: null }));
    recognition.onresult = (event: RecognitionEvent) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscriptRef.current += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      setState((previous) => ({ ...previous, transcript: `${finalTranscriptRef.current}${interim}`.trim() }));
    };
    recognition.onerror = (event: { error: string }) => {
      if (event.error === "aborted") return;
      setState((previous) => ({ ...previous, mode: "error", error: `Speech recognition error: ${event.error}` }));
    };
    recognition.onend = () => {
      const transcript = finalTranscriptRef.current.trim();
      recognitionRef.current = null;
      setState((previous) => ({ ...previous, mode: "idle", transcript: transcript || previous.transcript }));
      if (transcript) transcriptCallbackRef.current?.(transcript);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      setState((previous) => ({ ...previous, mode: "error", error: error instanceof Error ? error.message : "Could not start speech recognition." }));
    }
  }, [cancelSpeech]);

  const stopListening = useCallback(() => recognitionRef.current?.stop(), []);

  const toggleSound = useCallback(() => {
    const enabled = !soundEnabledRef.current;
    soundEnabledRef.current = enabled;
    saveVoiceSettings({ ttsEnabled: enabled });
    if (!enabled) cancelSpeech();
    setState((previous) => ({ ...previous, soundEnabled: enabled, ttsStatus: enabled ? null : "Muted" }));
  }, [cancelSpeech]);

  const setVoiceSpeed = useCallback((speed: number) => {
    const next = Math.min(2, Math.max(0.5, speed));
    speedRef.current = next;
    saveVoiceSettings({ talkingSpeed: next });
    setState((previous) => ({ ...previous, voiceSpeed: next }));
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (hasTts()) window.speechSynthesis.cancel();
  }, []);

  return { state, startListening, stopListening, speak, preloadSpeech: () => { if (hasTts()) window.speechSynthesis.getVoices(); }, enqueueSpeech, cancelSpeech, toggleSound, setVoiceSpeed };
}
