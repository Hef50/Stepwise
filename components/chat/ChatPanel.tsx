"use client";

import { useRef, useState, useCallback, useEffect, useMemo, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageCircle, Mic2, RefreshCw, Settings, Trash2, Type } from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import SettingsPanel from "@/components/common/SettingsPanel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { AudioOnlyPanel } from "./AudioOnlyPanel";
import { useVoiceTA } from "@/hooks/useVoiceTA";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { isRateLimitError } from "@/lib/rateLimit";
import type { UploadedFile, CanvasPayload, InteractionMode } from "@/lib/types";

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
}

const WHITEBOARD_VISION_PROMPT = `Analyze the provided whiteboard image for an AI tutor in a live session. Identify every equation, variable, symbol, diagram, graph, and written work shown. Transcribe mathematical notation exactly as written. Do not solve the problem yet; provide concise visual context the tutor can use to answer the student's question.`;
const MODE_MODEL_LABELS: Record<InteractionMode, string> = {
  text: "LLM7 fast",
  mixed: "LLM7 fast + Browser Speech",
  audio: "Gemini 3 Live",
};

async function analyzeVisualContext(
  question: string,
  images: string[]
): Promise<string | null> {
  if (images.length === 0) return null;

  const res = await fetch("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${WHITEBOARD_VISION_PROMPT}\n\nStudent context: "${question}"`,
      images,
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: string; rateLimited?: boolean }
      | null;
    const error = new Error(data?.error ?? `Vision API error: ${res.status}`);
    error.name = res.status === 429 || data?.rateLimited ? "RateLimitError" : "VisionError";
    throw error;
  }
  const data = (await res.json()) as { analysis?: string };
  return data.analysis?.trim() || null;
}

export function ChatPanel({ captureWhiteboard }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isPreparingContext, setIsPreparingContext] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("text");
  const [rateLimitLabel, setRateLimitLabel] = useState<string | null>(null);
  const lastWhiteboardCaptureRef = useRef<string | null>(null);
  const autoSpeechMessageRef = useRef<string | null>(null);
  const lastSubmitTextRef = useRef("");
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();
  const live = useGeminiLive();
  const {
    disconnect: disconnectLive,
    sendWhiteboardFrame,
    state: liveState,
  } = live;

  // Always start with empty messages so server and client render the same
  // initial HTML. Persisted messages are restored client-side in useEffect.
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: [],
    onError: (error) => {
      if (isRateLimitError(error)) {
        setRateLimitLabel("Rate limit reached");
      }
    },
  });

  const isGenerating = status === "streaming" || status === "submitted";
  const isLoading = isGenerating || isPreparingContext;
  const activeModelLabel = MODE_MODEL_LABELS[interactionMode];
  const visibleRateLimitLabel =
    interactionMode === "audio" && liveState.rateLimitReached
      ? "Rate limit reached"
      : rateLimitLabel;

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      lastSubmitTextRef.current = trimmed;
      setRateLimitLabel(null);
      setIsPreparingContext(true);

      try {
        const attachmentImages = files
          .filter((f) => f.type.startsWith("image/"))
          .map((f) => f.dataUrl);

        const whiteboardPayload = await captureWhiteboard();
        const imageUrls = whiteboardPayload?.imageDataUrl
          ? [whiteboardPayload.imageDataUrl, ...attachmentImages]
          : attachmentImages;

        const visualContext = await analyzeVisualContext(trimmed, imageUrls);

        sendMessage(
          { text: trimmed },
          visualContext ? { body: { visualContext } } : undefined
        );
        setInput("");
        setFiles([]);
      } catch (err) {
        console.error("[ChatPanel] Visual context error:", err);
        if (isRateLimitError(err)) {
          setRateLimitLabel("Rate limit reached");
        }
        sendMessage({ text: trimmed });
        setInput("");
        setFiles([]);
      } finally {
        setIsPreparingContext(false);
      }
    },
    [captureWhiteboard, files, isLoading, sendMessage]
  );

  const voice = useVoiceTA((transcript) => {
    if (interactionMode !== "mixed") return;
    setInput(transcript);
    window.setTimeout(() => {
      submitText(transcript);
    }, 80);
  });
  const { cancelSpeech, speak, stopListening } = voice;

  useEffect(() => {
    if (interactionMode !== "mixed") {
      cancelSpeech();
      stopListening();
    }
  }, [cancelSpeech, interactionMode, stopListening]);

  useEffect(() => {
    if (interactionMode !== "audio") {
      disconnectLive();
      lastWhiteboardCaptureRef.current = null;
    }
  }, [disconnectLive, interactionMode]);

  // Restore persisted messages after hydration (client-only)
  useEffect(() => {
    const persisted = loadMessages();
    if (persisted.length > 0) {
      const uiMessages: UIMessage[] = persisted.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
        metadata: undefined,
      }));
      setMessages(uiMessages);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  // Persist whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, saveMessages]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (interactionMode === "mixed") {
        voice.preloadSpeech(input);
      }
      submitText(input);
    },
    [input, interactionMode, submitText, voice]
  );

  const latestAssistant = useMemo(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    const text = latestAssistantMessage?.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("") ?? "";

    return {
      id: latestAssistantMessage?.id ?? null,
      text,
    };
  }, [messages]);

  const latestAssistantText = latestAssistant.text;

  useEffect(() => {
    if (
      interactionMode !== "mixed" ||
      isPreparingContext ||
      isGenerating ||
      !latestAssistant.text ||
      !voice.state.soundEnabled
    ) {
      return;
    }

    if (!latestAssistant.id || latestAssistant.id === autoSpeechMessageRef.current) return;

    autoSpeechMessageRef.current = latestAssistant.id;
    speak(latestAssistant.text);
  }, [
    interactionMode,
    isGenerating,
    isPreparingContext,
    latestAssistant.id,
    latestAssistant.text,
    speak,
    voice.state.soundEnabled,
  ]);

  const shareWhiteboardWithLive = useCallback(
    async (includeVisionText = true): Promise<string | null> => {
      const payload = await captureWhiteboard();
      if (!payload?.imageDataUrl) return null;

      const captureKey = payload.capturedAt;
      const isNewCapture = captureKey !== lastWhiteboardCaptureRef.current;
      if (!isNewCapture && !includeVisionText) return null;

      lastWhiteboardCaptureRef.current = captureKey;
      await sendWhiteboardFrame(payload.imageDataUrl);

      return "Whiteboard frame sent";
    },
    [captureWhiteboard, sendWhiteboardFrame]
  );

  const getWhiteboardAnalysis = useCallback(async (): Promise<string | null> => {
    if (interactionMode === "audio") {
      return shareWhiteboardWithLive(true);
    }

    const payload = await captureWhiteboard();
    if (!payload?.imageDataUrl) return null;

    return analyzeVisualContext(
      "Please analyze the whiteboard.",
      [payload.imageDataUrl]
    );
  }, [captureWhiteboard, interactionMode, shareWhiteboardWithLive]);

  const handleCaptureWhiteboard = useCallback(async () => {
    try {
      const analysis = await getWhiteboardAnalysis();
    if (!analysis) return;

      sendMessage(
        { text: "Please analyze the whiteboard." },
        { body: { visualContext: analysis } }
      );
    } catch (err) {
      console.error("[ChatPanel] Whiteboard vision error:", err);
      if (isRateLimitError(err)) {
        setRateLimitLabel("Rate limit reached");
      }
    }
  }, [getWhiteboardAnalysis, sendMessage]);

  const handleRateLimitRetry = useCallback(() => {
    setRateLimitLabel(null);

    if (interactionMode === "audio") {
      void live.toggleMute();
      return;
    }

    if (lastSubmitTextRef.current) {
      void submitText(lastSubmitTextRef.current);
    }
  }, [interactionMode, live, submitText]);

  const isAudioCallActive =
    interactionMode === "audio" &&
    (liveState.status === "connected" || liveState.status === "muted");

  useEffect(() => {
    if (!isAudioCallActive) return;

    let cancelled = false;

    const syncWhiteboard = async (includeVisionText: boolean) => {
      if (cancelled) return;
      try {
        await shareWhiteboardWithLive(includeVisionText);
      } catch (err) {
        console.error("[ChatPanel] Live whiteboard sync error:", err);
      }
    };

    void syncWhiteboard(true);

    const interval = window.setInterval(() => {
      void syncWhiteboard(false);
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAudioCallActive, shareWhiteboardWithLive]);

  useEffect(() => {
    if (!isAudioCallActive || liveState.turnCount === 0) return;
    void shareWhiteboardWithLive(true);
  }, [isAudioCallActive, liveState.turnCount, shareWhiteboardWithLive]);

  const handleDeleteMessage = useCallback(
    (id: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [setMessages]
  );

  const handleClear = useCallback(() => {
    clearSession();
    window.location.reload();
  }, [clearSession]);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-shrink-0 flex-col gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-sm font-semibold">Stepwise</h1>
              <p className="text-xs text-muted-foreground">AI Tutor</p>
            </div>

            <div className="flex items-center gap-1">
              <Dialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Settings">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>

                <SettingsPanel onClose={() => { /* dialog close handled internally by Dialog */ }} />
              </Dialog>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    aria-label="Clear chat history"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear chat history</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex rounded-md border border-border bg-muted/40 p-1">
            <Button
              type="button"
              variant={interactionMode === "text" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setInteractionMode("text")}
              aria-label="Text-only mode"
              className="h-8 flex-1 px-2"
            >
              <Type className="h-4 w-4" />
              Text
            </Button>
            <Button
              type="button"
              variant={interactionMode === "mixed" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setInteractionMode("mixed")}
              aria-label="Mixed mode"
              className="h-8 flex-1 px-2"
            >
              <MessageCircle className="h-4 w-4" />
              Mixed
            </Button>
            <Button
              type="button"
              variant={interactionMode === "audio" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setInteractionMode("audio")}
              aria-label="Audio-only mode"
              className="h-8 flex-1 px-2"
            >
              <Mic2 className="h-4 w-4" />
              Audio
            </Button>
          </div>

          <p className="px-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Model:</span>{" "}
            {activeModelLabel}
          </p>
          {visibleRateLimitLabel && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
              <span>{visibleRateLimitLabel}</span>
              <button
                type="button"
                onClick={handleRateLimitRetry}
                className="inline-flex items-center gap-1 font-medium hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}
        </div>

        <Separator />

        {interactionMode === "audio" ? (
          <AudioOnlyPanel live={live} onShareWhiteboard={getWhiteboardAnalysis} />
        ) : (
          <>
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              onDeleteMessage={handleDeleteMessage}
            />

            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={stop}
              isLoading={isLoading}
              voice={voice}
              files={files}
              onFilesChange={setFiles}
              onCaptureWhiteboard={handleCaptureWhiteboard}
              interactionMode={interactionMode}
              latestAssistantText={latestAssistantText}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
