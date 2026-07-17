"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  TurnCoverage,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import type { VoiceTranscriptEntry } from "@/lib/types";
import { dataUrlMimeType, dataUrlToBase64 } from "@/lib/speech";

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
  /** Increments after each completed conversation turn. */
  turnCount: number;
  /** Set when the latest whiteboard frame was sent to the session. */
  whiteboardSyncedAt: string | null;
}

export interface GeminiLiveControls {
  state: GeminiLiveState;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  sendTextContext: (text: string) => Promise<void>;
  sendWhiteboardFrame: (imageDataUrl: string) => Promise<void>;
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
    turnCount: 0,
    whiteboardSyncedAt: null,
  });

  const sessionRef = useRef<Session | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackTimeRef = useRef(0);
  const lastLocalBargeInRef = useRef(0);
  const outputFinalRef = useRef("");
  const lastInputCommittedRef = useRef("");
  const manualDisconnectRef = useRef(false);

  const appendTranscript = useCallback(
    (role: VoiceTranscriptEntry["role"], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setState((prev) => ({
        ...prev,
        transcriptHistory: [...prev.transcriptHistory, createTranscriptEntry(role, trimmed)].slice(-100),
      }));
    },
    []
  );

  const stopMic = useCallback((sendAudioStreamEnd = true) => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    micStreamRef.current = null;
    if (sendAudioStreamEnd) {
      try {
        sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // The socket can already be closing; local microphone cleanup still succeeded.
      }
    }
  }, []);

  const stopPlayback = useCallback(() => {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
      source.disconnect();
    });
    playbackSourcesRef.current.clear();
    playbackTimeRef.current = audioContextRef.current?.currentTime ?? 0;
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
    playbackSourcesRef.current.add(source);
    source.onended = () => {
      playbackSourcesRef.current.delete(source);
      source.disconnect();
    };

    const startAt = Math.max(audioContext.currentTime, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }, []);

  const handleMessage = useCallback(
    (message: LiveServerMessage) => {
      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        stopPlayback();
      }

      const finalInputText = content.inputTranscription?.text?.trim() ?? "";
      const interimInputText = content.interimInputTranscription?.text?.trim() ?? "";
      const inputText = finalInputText || interimInputText;
      if (inputText) {
        stopPlayback();
        if (finalInputText) {
          if (finalInputText !== lastInputCommittedRef.current) {
            appendTranscript("user", finalInputText);
            lastInputCommittedRef.current = finalInputText;
          }
          setState((prev) => ({ ...prev, inputCaption: "" }));
        } else {
          setState((prev) => ({ ...prev, inputCaption: interimInputText }));
        }
      }

      const outputText = content.outputTranscription?.text ?? "";
      if (outputText) {
        outputFinalRef.current += `${outputText} `;
        setState((prev) => ({
          ...prev,
          inputCaption: "",
          outputCaption: outputFinalRef.current.trim(),
        }));
      }

      content.modelTurn?.parts?.forEach((part) => {
        const data = part.inlineData?.data;
        if (data) playPcmAudio(data);
      });

      if (content.turnComplete) {
        appendTranscript("assistant", outputFinalRef.current);
        outputFinalRef.current = "";
        lastInputCommittedRef.current = "";
        setState((prev) => ({
          ...prev,
          inputCaption: "",
          outputCaption: "",
          turnCount: prev.turnCount + 1,
        }));
      }
    },
    [appendTranscript, playPcmAudio, stopPlayback]
  );

  const connect = useCallback(async () => {
    if (sessionRef.current || state.status === "connecting") return;

    manualDisconnectRef.current = false;
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
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: false },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            turnCoverage: TurnCoverage.TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO,
          },
          systemInstruction:
            "You are Stepwise, a warm expert AI teaching assistant in a live office-hours call. The student may share their whiteboard as video frames — carefully read every equation, variable, diagram, and written work shown there and use it as the primary source of truth for the problem they are working on. Keep answers concise, conversational, and educational. Ask a short follow-up question when it helps the student keep moving.",
        },
        callbacks: {
          onopen: () => {
            setState((prev) => ({
              ...prev,
              status: micStreamRef.current ? "connected" : "muted",
              muted: !micStreamRef.current,
              error: null,
            }));
          },
          onmessage: handleMessage,
          onerror: (event) => {
            const detail =
              event.message ||
              (event.error instanceof Error ? event.error.message : null) ||
              "Gemini Live connection error.";
            setState((prev) => ({
              ...prev,
              status: "error",
              muted: true,
              error: detail,
            }));
          },
          onclose: (event) => {
            const wasManualDisconnect = manualDisconnectRef.current;
            manualDisconnectRef.current = false;
            stopMic(false);
            sessionRef.current = null;
            setState((prev) => ({
              ...prev,
              status: wasManualDisconnect ? "idle" : "error",
              muted: true,
              error: wasManualDisconnect
                ? null
                : prev.error ??
                  event.reason ??
                  `Gemini Live call closed unexpectedly${event.code ? ` (${event.code})` : ""}.`,
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const session = sessionRef.current;
      if (!session) return;

      const input = event.inputBuffer.getChannelData(0);
      if (playbackSourcesRef.current.size > 0) {
        let energy = 0;
        for (let i = 0; i < input.length; i++) {
          energy += input[i] * input[i];
        }
        const rms = Math.sqrt(energy / input.length);
        const now = audioContext.currentTime;
        if (rms > 0.035 && now - lastLocalBargeInRef.current > 0.3) {
          lastLocalBargeInRef.current = now;
          stopPlayback();
        }
      }

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
  }, [stopPlayback]);

  const toggleMute = useCallback(async () => {
    if (!sessionRef.current) {
      await connect();
      if (!sessionRef.current) return;
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

  const sendWhiteboardFrame = useCallback(async (imageDataUrl: string) => {
    const trimmed = imageDataUrl.trim();
    if (!trimmed) return;

    if (!sessionRef.current) {
      await connect();
    }

    sessionRef.current?.sendRealtimeInput({
      video: {
        data: dataUrlToBase64(trimmed),
        mimeType: dataUrlMimeType(trimmed),
      },
    });

    setState((prev) => ({
      ...prev,
      whiteboardSyncedAt: new Date().toISOString(),
    }));
  }, [connect]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    stopPlayback();
    stopMic();
    try {
      sessionRef.current?.close();
    } catch {
      // The Live service may already have closed the session.
    }
    sessionRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    outputFinalRef.current = "";
    lastInputCommittedRef.current = "";
    setState((prev) => ({
      ...prev,
      status: "idle",
      muted: true,
      inputCaption: "",
      outputCaption: "",
      turnCount: 0,
      whiteboardSyncedAt: null,
    }));
  }, [stopMic, stopPlayback]);

  useEffect(() => disconnect, [disconnect]);

  return { state, connect, disconnect, toggleMute, sendTextContext, sendWhiteboardFrame };
}
