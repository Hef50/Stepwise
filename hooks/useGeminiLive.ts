"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session, LiveServerMessage } from "@google/genai";
import { GEMINI_LIVE_MODEL } from "@/lib/ai/gemini";
import type { CanvasPayload, LiveStatus, LiveTranscriptLine } from "@/lib/types";
import type { LiveTokenResponse } from "@/app/api/live/token/route";
import { parseDiagramSpec, type DiagramSpec } from "@/lib/whiteboard/diagramSpec";

const LIVE_OUTPUT_SAMPLE_RATE = 24000;
/** Whiteboard frame interval in milliseconds (~1 FPS) */
const FRAME_INTERVAL_MS = 1000;
/** Drop to 0.5 FPS when we last response was slow (simple TPM throttle) */
const FRAME_INTERVAL_SLOW_MS = 2000;

export interface UseGeminiLiveOptions {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  renderTextOnCanvas?: (text: string) => Promise<string | null>;
  renderDiagramOnCanvas?: (spec: DiagramSpec | string) => Promise<string | null>;
}

export interface UseGeminiLiveReturn {
  status: LiveStatus;
  muted: boolean;
  transcript: LiveTranscriptLine[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => Promise<void>;
  refreshWhiteboard: () => Promise<boolean>;
}

const LIVE_WHITEBOARD_TOOLS = [{
  functionDeclarations: [
    {
      name: "render_math_whiteboard",
      description: "Draw a mathematical equation or formula on the shared whiteboard. Call this whenever the student explicitly asks you to draw, write, or put an equation on the whiteboard, and whenever a displayed equation would materially help the explanation.",
      parametersJsonSchema: { type: "object", additionalProperties: false, properties: { latex: { type: "string", description: "Valid LaTeX without dollar delimiters." }, displayMode: { type: "boolean" } }, required: ["latex"] },
    },
    {
      name: "render_text_whiteboard",
      description: "Draw a short handwritten label or title on the shared whiteboard. Use only for short phrases, never paragraphs.",
      parametersJsonSchema: { type: "object", additionalProperties: false, properties: { text: { type: "string", description: "A short label of at most six words." } }, required: ["text"] },
    },
    {
      name: "render_diagram_whiteboard",
      description: "Draw a diagram on the shared whiteboard. Use when the student explicitly asks to draw a diagram or a diagram materially improves the explanation. specJson must be valid JSON for a DiagramSpec.",
      parametersJsonSchema: { type: "object", additionalProperties: false, properties: { specJson: { type: "string" } }, required: ["specJson"] },
    },
  ],
}];

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
  renderLatexOnCanvas,
  renderTextOnCanvas,
  renderDiagramOnCanvas,
}: UseGeminiLiveOptions): UseGeminiLiveReturn {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [muted, setMuted] = useState(false);
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
  const renderLatexRef = useRef(renderLatexOnCanvas);
  const renderTextRef = useRef(renderTextOnCanvas);
  const renderDiagramRef = useRef(renderDiagramOnCanvas);
  const executeToolCallsRef = useRef<(message: LiveServerMessage) => Promise<void>>(async () => {});

  useEffect(() => {
    renderLatexRef.current = renderLatexOnCanvas;
    renderTextRef.current = renderTextOnCanvas;
    renderDiagramRef.current = renderDiagramOnCanvas;
  }, [renderLatexOnCanvas, renderTextOnCanvas, renderDiagramOnCanvas]);

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

      if (msg.toolCall) void executeToolCallsRef.current(msg);

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

  const stopMic = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // A closing socket cannot accept the stream-end message.
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (!sessionRef.current) return;
    if (micStreamRef.current) {
      stopMic();
      setMuted(true);
      return;
    }
    const context = audioCtxRef.current;
    if (!context) return;
    try {
      await startMic(context);
      setMuted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restart the microphone.");
      setMuted(true);
    }
  }, [startMic, stopMic]);

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

  const refreshWhiteboard = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session) return false;
    const payload = await captureWhiteboard().catch(() => null);
    if (!payload?.imageDataUrl) return false;
    session.sendRealtimeInput({
      video: {
        data: payload.imageDataUrl.replace(/^data:image\/\w+;base64,/, ""),
        mimeType: "image/jpeg",
      },
    });
    return true;
  }, [captureWhiteboard]);

  const executeToolCalls = useCallback(async (message: LiveServerMessage) => {
    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length === 0 || !sessionRef.current) return;

    const functionResponses = await Promise.all(calls.map(async (call) => {
      const name = call.name ?? "unknown";
      const args = call.args ?? {};
      try {
        let shapeId: string | null = null;
        if (name === "render_math_whiteboard") {
          const latex = typeof args.latex === "string" ? args.latex.trim() : "";
          if (!latex || !renderLatexRef.current) throw new Error("LaTeX renderer is unavailable.");
          shapeId = await renderLatexRef.current(latex, args.displayMode !== false);
        } else if (name === "render_text_whiteboard") {
          const text = typeof args.text === "string" ? args.text.trim() : "";
          if (!text || !renderTextRef.current) throw new Error("Text renderer is unavailable.");
          shapeId = await renderTextRef.current(text);
        } else if (name === "render_diagram_whiteboard") {
          const raw = typeof args.specJson === "string" ? args.specJson : "";
          if (!raw || !renderDiagramRef.current) throw new Error("Diagram renderer is unavailable.");
          const spec = parseDiagramSpec(JSON.parse(raw));
          if (!spec) throw new Error("The diagram specification was invalid.");
          shapeId = await renderDiagramRef.current(spec);
        } else {
          throw new Error(`Unknown whiteboard tool: ${name}`);
        }
        if (!shapeId) throw new Error("The whiteboard could not create that shape.");
        await refreshWhiteboard();
        return { id: call.id, name, response: { output: { rendered: true, shapeId } } };
      } catch (error) {
        return { id: call.id, name, response: { error: error instanceof Error ? error.message : "Whiteboard rendering failed." } };
      }
    }));
    sessionRef.current?.sendToolResponse({ functionResponses });
  }, [refreshWhiteboard]);

  useEffect(() => {
    executeToolCallsRef.current = executeToolCalls;
  }, [executeToolCalls]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (workletNodeRef.current) workletNodeRef.current.port.onmessage = null;
    stopMic();
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
  }, [stopMic]);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    setError(null);
    setTranscript([]);
    setMuted(false);
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
          tools: LIVE_WHITEBOARD_TOOLS,
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

  return { status, muted, transcript, error, connect, disconnect, toggleMute, refreshWhiteboard };
}
