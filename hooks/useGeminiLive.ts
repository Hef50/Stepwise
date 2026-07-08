"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import type { VoiceTranscriptEntry } from "@/lib/types";

type LiveStatus = "idle" | "connecting" | "connected" | "muted" | "error";

interface LiveTokenResponse {
  token: string;
  model: string;
}

export interface GeminiLiveState {
  status: LiveStatus;
  muted: boolean;
  inputCaption: string;
  outputCaption: string;
  error: string | null;
  transcriptHistory: VoiceTranscriptEntry[];
}

export interface GeminiLiveControls {
  state: GeminiLiveState;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  sendTextContext: (text: string) => Promise<void>;
}

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

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

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function downsampleToPcm16(input: Float32Array, inputSampleRate: number): ArrayBufferLike {
  if (inputSampleRate === INPUT_SAMPLE_RATE) {
    return float32ToPcm16(input).buffer;
  }

  const ratio = inputSampleRate / INPUT_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / Math.max(1, end - start);
  }

  return float32ToPcm16(output).buffer;
}

function float32ToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function useGeminiLive(): GeminiLiveControls {
  const [state, setState] = useState<GeminiLiveState>({
    status: "idle",
    muted: true,
    inputCaption: "",
    outputCaption: "",
    error: null,
    transcriptHistory: [],
  });

  const sessionRef = useRef<Session | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playbackTimeRef = useRef(0);
  const inputFinalRef = useRef("");
  const outputFinalRef = useRef("");

  const appendTranscript = useCallback(
    (role: VoiceTranscriptEntry["role"], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setState((prev) => ({
        ...prev,
        transcriptHistory: [...prev.transcriptHistory, createTranscriptEntry(role, trimmed)].slice(-12),
      }));
    },
    []
  );

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    micStreamRef.current = null;
    sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
  }, []);

  const playPcmAudio = useCallback((base64: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const pcm = base64ToInt16Array(base64);
    const buffer = audioContext.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 0x8000;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }, []);

  const handleMessage = useCallback(
    (message: LiveServerMessage) => {
      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        playbackTimeRef.current = audioContextRef.current?.currentTime ?? 0;
      }

      const inputText =
        content.inputTranscription?.text ?? content.interimInputTranscription?.text ?? "";
      if (inputText) {
        setState((prev) => ({ ...prev, inputCaption: inputText }));
        if (content.inputTranscription?.text) {
          inputFinalRef.current += `${inputText} `;
        }
      }

      const outputText = content.outputTranscription?.text ?? "";
      if (outputText) {
        outputFinalRef.current += `${outputText} `;
        setState((prev) => ({ ...prev, outputCaption: outputFinalRef.current.trim() }));
      }

      content.modelTurn?.parts?.forEach((part) => {
        const data = part.inlineData?.data;
        if (data) playPcmAudio(data);
      });

      if (content.turnComplete) {
        appendTranscript("user", inputFinalRef.current);
        appendTranscript("assistant", outputFinalRef.current);
        inputFinalRef.current = "";
        outputFinalRef.current = "";
      }
    },
    [appendTranscript, playPcmAudio]
  );

  const connect = useCallback(async () => {
    if (sessionRef.current || state.status === "connecting") return;

    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    try {
      const tokenResponse = await fetch("/api/live-token", { method: "POST" });
      if (!tokenResponse.ok) {
        const data = (await tokenResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Live token request failed: ${tokenResponse.status}`);
      }

      const { token, model } = (await tokenResponse.json()) as LiveTokenResponse;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      playbackTimeRef.current = audioContext.currentTime;

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState((prev) => ({ ...prev, status: "muted", muted: true, error: null }));
          },
          onmessage: handleMessage,
          onerror: (event) => {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: event.message || "Gemini Live connection error.",
            }));
          },
          onclose: () => {
            stopMic();
            sessionRef.current = null;
            setState((prev) => ({
              ...prev,
              status: prev.status === "error" ? "error" : "idle",
              muted: true,
            }));
          },
        },
      });

      sessionRef.current = session;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        muted: true,
        error: err instanceof Error ? err.message : "Failed to connect to Gemini Live.",
      }));
    }
  }, [handleMessage, state.status, stopMic]);

  const startMic = useCallback(async () => {
    if (!sessionRef.current) return;

    const audioContext = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") await audioContext.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const session = sessionRef.current;
      if (!session) return;

      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleToPcm16(input, audioContext.sampleRate);
      session.sendRealtimeInput({
        audio: {
          data: arrayBufferToBase64(pcm),
          mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
        },
      });
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    micStreamRef.current = stream;
    sourceRef.current = source;
    processorRef.current = processor;
    silentGainRef.current = silentGain;

    setState((prev) => ({ ...prev, status: "connected", muted: false, error: null }));
  }, []);

  const toggleMute = useCallback(async () => {
    if (!sessionRef.current) {
      await connect();
      return;
    }

    if (micStreamRef.current) {
      stopMic();
      setState((prev) => ({ ...prev, status: "muted", muted: true }));
      return;
    }

    try {
      await startMic();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        muted: true,
        error:
          err instanceof Error
            ? err.message
            : "Could not start microphone. Check browser permissions.",
      }));
    }
  }, [connect, startMic, stopMic]);

  const sendTextContext = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!sessionRef.current) {
      await connect();
    }

    sessionRef.current?.sendRealtimeInput({ text: trimmed });
  }, [connect]);

  const disconnect = useCallback(() => {
    stopMic();
    sessionRef.current?.close();
    sessionRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setState((prev) => ({ ...prev, status: "idle", muted: true }));
  }, [stopMic]);

  useEffect(() => disconnect, [disconnect]);

  return { state, connect, disconnect, toggleMute, sendTextContext };
}
