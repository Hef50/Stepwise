"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Trash2 } from "lucide-react";
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
import type {
  UploadedFile,
  CanvasPayload,
  MaterialExtractResponse,
  VisionResponse,
} from "@/lib/types";

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
}

export function ChatPanel({ captureWhiteboard }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const voice = useVoiceTA();
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();

  // Always start with empty messages so server and client render the same
  // initial HTML. Persisted messages are restored client-side in useEffect.
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    messages: [],
  });

  const isLoading = status === "streaming" || status === "submitted" || isProcessingFiles;

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
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const pdfFiles = files.filter((f) => f.type === "application/pdf");
      const contextParts: string[] = [];

      if (imageFiles.length > 0 || pdfFiles.length > 0) {
        setIsProcessingFiles(true);
        try {
          // Process images through vision API
          for (const img of imageFiles) {
            try {
              const res = await fetch("/api/vision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt:
                    "Describe the content of this image in detail so an AI tutor can reference it when answering the student's question.",
                  images: [img.dataUrl],
                }),
              });
              if (res.ok) {
                const data = (await res.json()) as VisionResponse;
                contextParts.push(`[Attached Image: ${img.name}]\n${data.analysis}`);
              }
            } catch {
              // Non-fatal: skip this image silently
            }
          }

          // Extract text from PDFs
          for (const pdf of pdfFiles) {
            try {
              const res = await fetch("/api/materials/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataUrl: pdf.dataUrl, name: pdf.name }),
              });
              if (res.ok) {
                const data = (await res.json()) as MaterialExtractResponse;
                // Truncate very long PDFs to avoid exceeding context limits
                const truncated =
                  data.text.length > 8000
                    ? data.text.slice(0, 8000) + "\n…[truncated]"
                    : data.text;
                contextParts.push(
                  `[Attached PDF: ${data.name} (${data.pageCount} page${data.pageCount !== 1 ? "s" : ""})]\n${truncated}`
                );
              }
            } catch {
              // Non-fatal: skip this PDF silently
            }
          }
        } finally {
          setIsProcessingFiles(false);
        }
      }

      const messageText =
        contextParts.length > 0
          ? `${contextParts.join("\n\n")}\n\n${trimmed}`
          : trimmed;

      sendMessage({ text: messageText });
      setInput("");
      setFiles([]);
    },
    [input, files, isLoading, sendMessage]
  );

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

      // Inject the vision analysis as a user message context
      sendMessage({
        text: `[Whiteboard Analysis]\n${data.analysis}`,
      });
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
