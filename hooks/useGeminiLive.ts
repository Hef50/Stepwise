"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session, LiveServerMessage } from "@google/genai";
import { GEMINI_LIVE_MODEL } from "@/lib/ai/gemini";
import type { CanvasPayload, LiveStatus, LiveTranscriptLine } from "@/lib/types";
import type { LiveTokenResponse } from "@/app/api/live/token/route";

const LIVE_OUTPUT_SAMPLE_RATE = 24000;
/** Whiteboard frame interval in milliseconds (~1 FPS) */
const FRAME_INTERVAL_MS = 1000;
/** Drop to 0.5 FPS when we last response was slow (simple TPM throttle) */
const FRAME_INTERVAL_SLOW_MS = 2000;

export interface UseGeminiLiveOptions {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
}

export interface UseGeminiLiveReturn {
  status: LiveStatus;
  transcript: LiveTranscriptLine[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useGeminiLive({
  captureWhiteboard,
}: UseGeminiLiveOptions): UseGeminiLiveReturn {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [transcript, setTranscript] = useState<LiveTranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Scheduled end time for the last queued audio buffer (Web Audio API clock) */
  const nextPlayTimeRef = useRef<number>(0);
  /** True while the model is streaming audio output */
  const isSpeakingRef = useRef<boolean>(false);
  /** Last turn ended slow — throttle whiteboard frames */
  const slowResponseRef = useRef<boolean>(false);

  // ── Transcript helpers ────────────────────────────────────────────────────

  const upsertTranscriptLine = useCallback(
    (role: "user" | "model", text: string, partial: boolean) => {
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role && last.partial) {
          // Gemini sends transcription as incremental fragments — accumulate them
          return [...prev.slice(0, -1), { ...last, text: last.text + text, partial }];
        }
        return [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, text, partial },
        ];
      });
    },
    []
  );

  // ── Audio output playback ─────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    nextPlayTimeRef.current = ctx.currentTime;
    isSpeakingRef.current = false;
    setStatus("active");
  }, []);

  const playAudioChunk = useCallback((base64Pcm: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const arrayBuf = base64ToArrayBuffer(base64Pcm);
    const int16 = new Int16Array(arrayBuf);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const audioBuf = ctx.createBuffer(1, float32.length, LIVE_OUTPUT_SAMPLE_RATE);
    audioBuf.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuf.duration;

    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true;
      setStatus("speaking");
    }

    source.onended = () => {
      if (nextPlayTimeRef.current <= ctx.currentTime + 0.05) {
        isSpeakingRef.current = false;
        setStatus("active");
      }
    };
  }, []);

  // ── Message handler ───────────────────────────────────────────────────────

  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      const sc = msg.serverContent;

      // Audio output — use the convenience `data` getter
      if (msg.data) {
        playAudioChunk(msg.data);
      }

      // Input transcription (user speech)
      if (sc?.inputTranscription?.text) {
        upsertTranscriptLine(
          "user",
          sc.inputTranscription.text,
          !(sc.inputTranscription.finished ?? false)
        );
      }

      // Output transcription (model speech)
      if (sc?.outputTranscription?.text) {
        upsertTranscriptLine(
          "model",
          sc.outputTranscription.text,
          !(sc.outputTranscription.finished ?? false)
        );
      }

      // Turn complete — model finished responding
      if (sc?.turnComplete) {
        isSpeakingRef.current = false;
        setStatus("active");
      }

      // Model was interrupted (barge-in)
      if (sc?.interrupted) {
        stopPlayback();
        slowResponseRef.current = false;
      }
    },
    [playAudioChunk, upsertTranscriptLine, stopPlayback]
  );

  // ── Mic capture setup ─────────────────────────────────────────────────────

  const startMic = useCallback(async (ctx: AudioContext) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    micStreamRef.current = stream;

    await ctx.audioWorklet.addModule("/worklets/mic-processor.js");

    const micSource = ctx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(ctx, "mic-processor");
    micStreamRef.current = stream;
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      const session = sessionRef.current;
      if (!session) return;
      const base64 = arrayBufferToBase64(ev.data);
      session.sendRealtimeInput({
        audio: {
          data: base64,
          mimeType: `audio/pcm;rate=${ctx.sampleRate}`,
        },
      });
    };

    micSource.connect(workletNode);
    workletNode.connect(ctx.destination);
  }, []);

  // ── Whiteboard frame streaming ────────────────────────────────────────────

  const startFrameStream = useCallback(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    const sendFrame = async () => {
      const session = sessionRef.current;
      if (!session) return;

      const payload = await captureWhiteboard().catch(() => null);
      if (!payload?.imageDataUrl) return;

      // Strip data URL prefix to get raw base64
      const base64 = payload.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");

      session.sendRealtimeInput({
        video: { data: base64, mimeType: "image/jpeg" },
      });
    };

    const interval = slowResponseRef.current ? FRAME_INTERVAL_SLOW_MS : FRAME_INTERVAL_MS;
    frameIntervalRef.current = setInterval(() => void sendFrame(), interval);
  }, [captureWhiteboard]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    isSpeakingRef.current = false;
    nextPlayTimeRef.current = 0;
    slowResponseRef.current = false;
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    setError(null);
    setTranscript([]);
    setStatus("connecting");

    try {
      // 1. Fetch ephemeral token from our server route
      const tokenRes = await fetch("/api/live/token", { method: "POST" });
      if (!tokenRes.ok) {
        throw new Error(`Token fetch failed: ${tokenRes.status}`);
      }
      const { token } = (await tokenRes.json()) as LiveTokenResponse;
      if (!token) throw new Error("Empty token received");

      // 2. Create AudioContext for both mic capture and playback
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      // 3. Establish Gemini Live session
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus("active");
          },
          onmessage: handleMessage,
          onerror: (e: ErrorEvent) => {
            setError(e.message ?? "Live session error");
            setStatus("error");
            cleanup();
          },
          onclose: () => {
            setStatus("idle");
            cleanup();
          },
        },
      });
      sessionRef.current = session;

      // 4. Start microphone capture
      await startMic(ctx);

      // 5. Start whiteboard frame streaming
      startFrameStream();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
      cleanup();
    }
  }, [status, handleMessage, startMic, startFrameStream, cleanup]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("idle");
    setError(null);
  }, [cleanup]);

  // Cleanup on component unmount or hot-reload
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run cleanup only on unmount

  return { status, transcript, error, connect, disconnect };
}
