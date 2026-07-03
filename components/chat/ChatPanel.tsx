"use client";

import { useRef, useState, useCallback, useEffect, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Trash2, Settings } from "lucide-react";
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
import { useVoiceTA } from "@/hooks/useVoiceTA";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import type { UploadedFile, CanvasPayload } from "@/lib/types";

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
}

async function analyzeVisualContext(
  question: string,
  images: string[]
): Promise<string | null> {
  if (images.length === 0) return null;

  const res = await fetch("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `The student is asking: "${question}"

Analyze the provided image(s) for an AI tutor. The first image is the current whiteboard when present; any remaining images are attachments. Identify the problem, notation, diagrams, equations, and relevant work shown. Do not solve the problem yet; provide concise visual context the tutor can use to answer the student's question.`,
      images,
    }),
  });

  if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
  const data = (await res.json()) as { analysis?: string };
  return data.analysis?.trim() || null;
}

export function ChatPanel({ captureWhiteboard }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isPreparingContext, setIsPreparingContext] = useState(false);
  const lastSpokenAssistantRef = useRef<string | null>(null);
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();

  // Always start with empty messages so server and client render the same
  // initial HTML. Persisted messages are restored client-side in useEffect.
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: [],
  });

  const isGenerating = status === "streaming" || status === "submitted";
  const isLoading = isGenerating || isPreparingContext;

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

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
    setInput(transcript);
    window.setTimeout(() => {
      submitText(transcript);
    }, 80);
  });

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
      submitText(input);
    },
    [input, submitText]
  );

  useEffect(() => {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const lastAssistantText = lastAssistantMessage?.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("") ?? "";

    if (!lastAssistantText || !voice.state.nativeVoiceModeEnabled || !voice.state.supported) {
      return;
    }

    const assistantId = lastAssistantMessage?.id ?? null;
    if (assistantId && assistantId === lastSpokenAssistantRef.current) {
      return;
    }

    lastSpokenAssistantRef.current = assistantId;
    voice.speak(lastAssistantText);
  }, [messages, voice]);

  const handleCaptureWhiteboard = useCallback(async () => {
    const payload = await captureWhiteboard();
    if (!payload?.imageDataUrl) return;

    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            "Analyze what is drawn on this whiteboard. Describe the content clearly so the AI tutor can reference it in the conversation.",
          images: [payload.imageDataUrl],
        }),
      });

      if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
      const data = (await res.json()) as { analysis: string };

      sendMessage(
        { text: "Please analyze the whiteboard." },
        { body: { visualContext: data.analysis } }
      );
    } catch (err) {
      console.error("[ChatPanel] Whiteboard vision error:", err);
    }
  }, [captureWhiteboard, sendMessage]);

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

  // Get last assistant message text for TTS
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const lastAssistantText =
    lastAssistantMsg?.parts
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("") ?? undefined;

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h1 className="text-sm font-semibold">Stepwise</h1>
            <p className="text-xs text-muted-foreground">AI Tutor</p>
          </div>
          <div className="flex items-center gap-2">
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

        <Separator />

        {/* Messages */}
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          onDeleteMessage={handleDeleteMessage}
        />

        {/* Input */}
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
          lastAssistantMessage={lastAssistantText}
        />
      </div>
    </TooltipProvider>
  );
}
