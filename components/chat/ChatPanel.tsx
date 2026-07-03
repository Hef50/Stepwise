"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent, type RefObject } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Trash2 } from "lucide-react";
import { type Editor } from "@tldraw/tldraw";
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
import { parseMessageBlocks, parseWhiteboardInstructions } from "@/lib/markdown/parseBlocks";
import { createAiShapes } from "@/lib/whiteboard/createShapes";
import {
  MIN_WHITEBOARD_TEXT_WORDS,
  MAX_WHITEBOARD_TEXT_CHARS,
  countWords,
  stripLatexArtifacts,
  looksLikeRawMath,
} from "@/lib/whiteboard/config";
import type {
  UploadedFile,
  CanvasPayload,
  VisionResponse,
  CourseMaterial,
  WhiteboardShapeInstruction,
} from "@/lib/types";

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  editorRef: RefObject<Editor | null>;
  /**
   * Optional refs that AppShell populates after mount so the whiteboard
   * action bar can trigger these handlers without prop-drilling through
   * the dynamic-import boundary.
   */
  describeRef?: RefObject<(() => void) | null>;
  checkWorkRef?: RefObject<(() => void) | null>;
}

export function ChatPanel({ captureWhiteboard, editorRef, describeRef, checkWorkRef }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [courseMaterials, setCourseMaterials] = useState<CourseMaterial[]>([]);
  const voice = useVoiceTA();
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();

  // Build the course context string from all active materials.
  // Stored in a ref so the custom fetch closure always sees the latest value
  // without needing to recreate the Chat transport (which is fixed at init).
  const courseContextRef = useRef("");
  courseContextRef.current = courseMaterials
    .filter((m) => m.active)
    .map((m) => `### ${m.name}\n${m.text}`)
    .join("\n\n");

  // Stable transport — created once; reads courseContextRef on every request via
  // prepareSendMessagesRequest so active course materials are always injected.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            courseContext: courseContextRef.current || undefined,
          },
        }),
      }),
    [] // stable — never recreated
  );

  // Always start with empty messages so server and client render the same
  // initial HTML. Persisted messages are restored client-side in useEffect.
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport,
    messages: [],
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Track previous status so we can detect the streaming→idle transition.
  const prevStatusRef = useRef(status);
  // Guard so each assistant message is auto-placed on the whiteboard exactly once.
  const placedMessageIdsRef = useRef<Set<string>>(new Set());

  /** Place shapes from a whiteboard instruction set on the tldraw canvas. */
  const handleSendToWhiteboard = useCallback(
    (instructions: WhiteboardShapeInstruction[]) => {
      if (!editorRef.current || instructions.length === 0) return;
      createAiShapes(editorRef.current, instructions);
    },
    [editorRef]
  );

  // After streaming ends, auto-place shapes on the whiteboard:
  //   1. Any explicit ```whiteboard JSON``` blocks from the AI
  //   2. All mermaid / schemdraw diagrams found in the response
  //   3. A text annotation with the key explanation (first substantial text block)
  useEffect(() => {
    const justFinished =
      (prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted") &&
      status === "ready";
    prevStatusRef.current = status;

    if (!justFinished) return;
    if (!editorRef.current) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    // Only ever auto-place a given message once — prevents duplicate/reappearing
    // shapes when this effect re-runs for unrelated reasons.
    if (placedMessageIdsRef.current.has(lastAssistant.id)) return;
    placedMessageIdsRef.current.add(lastAssistant.id);

    const rawText = lastAssistant.parts
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");

    const instructions: WhiteboardShapeInstruction[] = [];

    // 1. Explicit whiteboard blocks (JSON instructions from the AI)
    instructions.push(...parseWhiteboardInstructions(rawText));

    // 2 & 3. Parse all blocks to extract diagrams and key text
    const blocks = parseMessageBlocks(rawText);

    // Text: split prose into paragraphs and place only substantial ones.
    // Each fragment must have > MIN_WHITEBOARD_TEXT_WORDS words and must not
    // look like raw LaTeX/code, so stray math and short labels stay off canvas.
    const textInstructions: WhiteboardShapeInstruction[] = [];
    for (const block of blocks) {
      if (block.kind !== "text") continue;
      const paragraphs = block.content.split(/\n{2,}/);
      for (const para of paragraphs) {
        const cleaned = stripLatexArtifacts(para);
        if (looksLikeRawMath(cleaned)) continue;
        if (countWords(cleaned) < MIN_WHITEBOARD_TEXT_WORDS) continue;
        textInstructions.push({
          kind: "text",
          content: cleaned.slice(0, MAX_WHITEBOARD_TEXT_CHARS),
        });
      }
    }
    // Cap at the first two qualifying paragraphs to keep the canvas clean.
    instructions.push(...textInstructions.slice(0, 2));

    // Diagrams: all mermaid / schemdraw blocks auto-placed
    for (const block of blocks) {
      if (block.kind === "diagram") {
        instructions.push({ kind: block.diagramType, content: block.code });
      }
    }

    if (instructions.length > 0) {
      createAiShapes(editorRef.current, instructions);
    }
  }, [status, messages, editorRef]);

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
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

      // Build text payload (images are sent via vision API separately)
      const imageUrls = files
        .filter((f) => f.type.startsWith("image/"))
        .map((f) => f.dataUrl);

      const messageText =
        imageUrls.length > 0
          ? `${trimmed}\n\n[${imageUrls.length} image(s) attached — see vision context]`
          : trimmed;

      sendMessage({ text: messageText });
      setInput("");
      setFiles([]);
    },
    [input, files, isLoading, sendMessage]
  );

  /** Shared helper that calls the vision route and injects the result as a message. */
  const callVision = useCallback(
    async (
      imageDataUrl: string,
      task: VisionResponse["task"],
      context?: string
    ) => {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [imageDataUrl], task, context }),
      });

      if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
      const data = (await res.json()) as VisionResponse;
      return data.analysis;
    },
    []
  );

  /** "What's on my whiteboard" — task: describe */
  const handleDescribeWhiteboard = useCallback(async () => {
    const payload = await captureWhiteboard();
    if (!payload?.imageDataUrl) {
      sendMessage({ text: "The whiteboard appears to be empty. Please draw something first." });
      return;
    }

    try {
      const analysis = await callVision(payload.imageDataUrl, "describe");
      sendMessage({
        text: `[Whiteboard snapshot]\n${analysis}`,
      });
    } catch (err) {
      console.error("[ChatPanel] Describe whiteboard error:", err);
    }
  }, [captureWhiteboard, callVision, sendMessage]);

  /** "Check my work" — task: check_work with optional problem context */
  const handleCheckWork = useCallback(async () => {
    const payload = await captureWhiteboard();
    if (!payload?.imageDataUrl) {
      sendMessage({ text: "The whiteboard appears to be empty. Please show your work first." });
      return;
    }

    // Use the current input as problem context if the user has typed something;
    // otherwise fall back to the last few user messages.
    const contextFromInput = input.trim();
    const contextFromHistory = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) =>
        m.parts
          .filter((p) => p.type === "text")
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("")
      )
      .join("\n");

    const context = contextFromInput || contextFromHistory || undefined;

    try {
      const analysis = await callVision(payload.imageDataUrl, "check_work", context);
      sendMessage({
        text: `[Check my work]\n${analysis}`,
      });
      if (contextFromInput) setInput("");
    } catch (err) {
      console.error("[ChatPanel] Check work error:", err);
    }
  }, [captureWhiteboard, callVision, sendMessage, input, messages]);

  // Expose handlers to AppShell so the whiteboard action bar can call them
  // without prop-drilling through the dynamic-import/SSR boundary.
  useEffect(() => {
    if (describeRef) describeRef.current = handleDescribeWhiteboard;
    if (checkWorkRef) checkWorkRef.current = handleCheckWork;
  }, [describeRef, checkWorkRef, handleDescribeWhiteboard, handleCheckWork]);

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

  const handleAddCourseMaterial = useCallback((material: CourseMaterial) => {
    setCourseMaterials((prev) => [...prev, material]);
  }, []);

  const handleToggleCourseMaterial = useCallback((id: string) => {
    setCourseMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, active: !m.active } : m))
    );
  }, []);

  const handleRemoveCourseMaterial = useCallback((id: string) => {
    setCourseMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

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
          onSendToWhiteboard={handleSendToWhiteboard}
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
          courseMaterials={courseMaterials}
          onAddCourseMaterial={handleAddCourseMaterial}
          onToggleCourseMaterial={handleToggleCourseMaterial}
          onRemoveCourseMaterial={handleRemoveCourseMaterial}
          lastAssistantMessage={lastAssistantText}
        />
      </div>
    </TooltipProvider>
  );
}
