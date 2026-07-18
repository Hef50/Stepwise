"use client";

import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertTriangle, RefreshCw, Trash2, Zap } from "lucide-react";
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
import { CourseMaterialsBar } from "./CourseMaterialsBar";
import { TextSpeedSlider } from "./TextSpeedSlider";
import { LatexFontSizeSlider } from "./LatexFontSizeSlider";
import { WhiteboardTextControls } from "./WhiteboardTextControls";
import { loadTextSpeed, saveTextSpeed } from "@/lib/chat/textReveal";
import { useVoiceTA } from "@/hooks/useVoiceTA";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useCourseMaterials, toMessageAttachment } from "@/hooks/useCourseMaterials";
import { detectWhiteboardIntent } from "@/lib/chat/whiteboardIntent";
import { extractNewEquations } from "@/lib/chat/extractEquations";
import { extractNewBoardText } from "@/lib/chat/extractBoardText";
import type { WhiteboardTextMode } from "@/lib/whiteboard/textStyle";
import type {
  UploadedFile,
  CanvasPayload,
  ActiveModel,
  ChatProvider,
  MessagePdfAttachment,
  StepwiseMessageMetadata,
  WhiteboardDrawQueueItem,
} from "@/lib/types";

type StepwiseUIMessage = UIMessage<StepwiseMessageMetadata>;

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  /** Routes a LaTeX string to the tldraw canvas as an animated shape. Returns the created shape id or null. */
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /** Routes short handwritten text to the tldraw canvas. Returns the created shape id or null. */
  renderTextOnCanvas?: (text: string) => Promise<string | null>;
  /** Pan + zoom the canvas to focus on the given tldraw shape id. */
  focusLatexShape?: (shapeId: string) => void;
  /** Current on-canvas LaTeX font size (px ≈ 1em). */
  latexFontSize?: number;
  /** Persist + apply a new LaTeX font size across existing shapes. */
  onLatexFontSizeChange?: (size: number) => void;
  wbTextSize?: number;
  onWbTextSizeChange?: (size: number) => void;
  wbTextColor?: string;
  onWbTextColorChange?: (color: string) => void;
  wbTextMode?: WhiteboardTextMode;
  onWbTextModeChange?: (mode: WhiteboardTextMode) => void;
  /** Wipe the whiteboard document (shapes + IndexedDB persistence). */
  onClearWhiteboard?: () => Promise<void> | void;
  /** True once the tldraw editor has mounted and can accept shapes. */
  editorReady?: boolean;
  onActiveModelChange?: (model: ActiveModel) => void;
  /** Session Dev Mode — enables smoke-test shortcut and failure injection. */
  devMode?: boolean;
  /** When true (and Dev Mode), LLM7 requests are forced to fail. */
  forceLlm7Fail?: boolean;
  /**
   * Dev Mode: keep the typing indicator visible for at least this many ms
   * after a request starts (even if tokens arrive sooner).
   */
  typingHoldMs?: number;
}

function isRateLimitError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const lower = msg.toLowerCase();
  return (
    msg.includes("GEMMA_RATE_LIMITED") ||
    msg.includes("LLM7_RATE_LIMITED") ||
    msg.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests")
  );
}

/** Map stream / HTTP error tokens into a short student-facing explanation. */
function formatChatErrorMessage(
  error: Error | null | undefined,
  failedOn: ChatProvider
): string {
  const msg = error?.message ?? "";

  if (
    msg.includes("LLM7_FORBIDDEN") ||
    msg.includes("upstream_forbidden") ||
    msg.includes("403")
  ) {
    return "LLM7 refused the request (upstream forbidden). Retry, or try Gemma 4 instead.";
  }
  if (msg.includes("LLM7_REJECTED") || msg.includes("LLM7 rejected")) {
    return "LLM7 rejected the request. Retrying or switching providers may help.";
  }
  if (msg.includes("LLM7_RATE_LIMITED")) {
    return "LLM7 is rate limited. Wait a moment and retry, or try Gemma 4.";
  }
  if (msg.includes("LLM7_FAILED")) {
    return "LLM7 failed to respond. You can retry the same prompt or try Gemma 4.";
  }
  if (msg.includes("GEMMA_FAILED")) {
    return "Gemma 4 via OpenRouter failed. You can retry or switch back to LLM7.";
  }
  if (msg.includes("GEMMA_RATE_LIMITED")) {
    return "Gemma 4 (free tier) is temporarily overloaded.";
  }

  const cleaned = msg.replace(/^Error:\s*/i, "").trim().slice(0, 180);
  if (cleaned) return cleaned;

  return failedOn === "gemma"
    ? "Gemma 4 via OpenRouter returned an error."
    : "The LLM provider returned an error.";
}

function getLastUserText(messages: StepwiseUIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    return message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

/** Extra body flags shared by sendMessage / regenerate in Dev Mode. */
function buildDevChatBodyFlags(
  text: string,
  devMode: boolean,
  forceLlm7Fail: boolean
): { forceLlm7Fail?: true; smokeTest?: true } {
  if (!devMode) return {};
  const flags: { forceLlm7Fail?: true; smokeTest?: true } = {};
  if (text.trim() === "t") {
    flags.smokeTest = true;
  } else if (forceLlm7Fail) {
    // Smoke test wins over forced failure when both would apply
    flags.forceLlm7Fail = true;
  }
  return flags;
}

export function ChatPanel({
  captureWhiteboard,
  renderLatexOnCanvas,
  renderTextOnCanvas,
  focusLatexShape,
  latexFontSize,
  onLatexFontSizeChange,
  wbTextSize,
  onWbTextSizeChange,
  wbTextColor,
  onWbTextColorChange,
  wbTextMode,
  onWbTextModeChange,
  onClearWhiteboard,
  editorReady = false,
  onActiveModelChange,
  devMode = false,
  forceLlm7Fail = false,
  typingHoldMs = 0,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  /** Once true, all subsequent messages in this session use Gemma via OpenRouter */
  const [escalated, setEscalated] = useState(false);
  /** True if the user manually downgraded from Gemma to LLM7 to escape a rate limit */
  const [manuallyDowngraded, setManuallyDowngraded] = useState(false);
  const [textSpeed, setTextSpeed] = useState(loadTextSpeed);
  const [isCatchingUpReveal, setIsCatchingUpReveal] = useState(false);
  const voice = useVoiceTA();
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();
  const courseMaterials = useCourseMaterials();

  // ── Equation / text canvas sync ──────────────────────────────────────────
  /** Equations already rendered on the whiteboard (normalized latex → shapeId) */
  const equationShapeMapRef = useRef<Map<string, string>>(new Map());
  /** Set of normalized latex strings sent to the whiteboard (prevents re-sending) */
  const renderedEquationsRef = useRef<Set<string>>(new Set());
  /** Set of normalized board-text labels already sent (prevents re-sending) */
  const renderedBoardTextRef = useRef<Set<string>>(new Set());
  /** Throttled reveal text from ChatMessages — extraction keys off this, not the raw stream. */
  const [revealedText, setRevealedText] = useState("");
  /**
   * Serial draw queue: at most one shape animates at a time, and text reveal
   * is paused while a draw is in flight. Preserves latex/text emission order.
   */
  const drawQueueRef = useRef<WhiteboardDrawQueueItem[]>([]);
  const drawingRef = useRef(false);
  const [revealPaused, setRevealPaused] = useState(false);
  /** Latex strings whose whiteboard draw has finished — unlocks chat cards. */
  const [readyEquations, setReadyEquations] = useState<Set<string>>(
    () => new Set()
  );
  const renderLatexRef = useRef(renderLatexOnCanvas);
  renderLatexRef.current = renderLatexOnCanvas;
  const renderTextRef = useRef(renderTextOnCanvas);
  renderTextRef.current = renderTextOnCanvas;

  const markEquationReady = useCallback((latex: string) => {
    const key = latex.trim();
    setReadyEquations((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const enqueueLatexDraw = useCallback((latex: string) => {
    const key = latex.trim();
    if (!key) return;
    if (renderedEquationsRef.current.has(key)) return;
    if (
      drawQueueRef.current.some(
        (q) => q.kind === "latex" && q.content.trim() === key
      )
    ) {
      return;
    }
    renderedEquationsRef.current.add(key);
    drawQueueRef.current.push({ kind: "latex", content: latex });
  }, []);

  const enqueueTextDraw = useCallback((text: string) => {
    const key = text.trim().toLowerCase();
    if (!key) return;
    if (renderedBoardTextRef.current.has(key)) return;
    if (
      drawQueueRef.current.some(
        (q) => q.kind === "text" && q.content.trim().toLowerCase() === key
      )
    ) {
      return;
    }
    renderedBoardTextRef.current.add(key);
    drawQueueRef.current.push({ kind: "text", content: text.trim() });
  }, []);

  const processDrawQueue = useCallback(async () => {
    if (drawingRef.current) return;
    if (!editorReady) return;
    if (drawQueueRef.current.length === 0) return;

    drawingRef.current = true;
    setRevealPaused(true);

    try {
      while (drawQueueRef.current.length > 0) {
        const item = drawQueueRef.current.shift();
        if (!item) break;

        if (item.kind === "latex") {
          const render = renderLatexRef.current;
          if (!render) {
            renderedEquationsRef.current.delete(item.content.trim());
            continue;
          }
          const shapeId = await render(item.content, true);
          if (shapeId) {
            equationShapeMapRef.current.set(item.content.trim(), shapeId);
            markEquationReady(item.content);
          } else {
            renderedEquationsRef.current.delete(item.content.trim());
          }
        } else {
          const render = renderTextRef.current;
          if (!render) {
            renderedBoardTextRef.current.delete(
              item.content.trim().toLowerCase()
            );
            continue;
          }
          const shapeId = await render(item.content);
          if (!shapeId) {
            renderedBoardTextRef.current.delete(
              item.content.trim().toLowerCase()
            );
          }
        }
      }
    } finally {
      const hasMore = drawQueueRef.current.length > 0;
      drawingRef.current = false;
      if (hasMore) {
        void processDrawQueue();
      } else {
        setRevealPaused(false);
      }
    }
  }, [editorReady, markEquationReady]);

  // Keep stable refs for useChat.onToolCall (may capture an early closure)
  const enqueueLatexDrawRef = useRef(enqueueLatexDraw);
  enqueueLatexDrawRef.current = enqueueLatexDraw;
  const enqueueTextDrawRef = useRef(enqueueTextDraw);
  enqueueTextDrawRef.current = enqueueTextDraw;
  const processDrawQueueRef = useRef(processDrawQueue);
  processDrawQueueRef.current = processDrawQueue;

  const provider: ChatProvider = escalated ? "gemma" : "llm7";

  // Notify parent when active model changes
  useEffect(() => {
    onActiveModelChange?.(escalated ? "gemma" : "llm7");
  }, [escalated, onActiveModelChange]);

  const handleTextSpeedChange = useCallback((speed: number) => {
    setTextSpeed(speed);
    saveTextSpeed(speed);
  }, []);

  const { messages, sendMessage, setMessages, status, stop, error, clearError, regenerate, addToolOutput } =
    useChat<StepwiseUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
      messages: [],

      async onToolCall({ toolCall }) {
        // Guard required by AI SDK: dynamic tools must be handled separately
        if (toolCall.dynamic) return;

        if (toolCall.toolName === "render_math_whiteboard") {
          const { latex } = toolCall.input as {
            latex: string;
            displayMode?: boolean;
          };

          enqueueLatexDrawRef.current(latex);
          void processDrawQueueRef.current();

          addToolOutput({
            tool: "render_math_whiteboard",
            toolCallId: toolCall.toolCallId,
            output: { rendered: true },
          });
        }

        if (toolCall.toolName === "render_text_whiteboard") {
          const { text } = toolCall.input as {
            text: string;
            kind?: "label" | "title" | "note";
          };

          enqueueTextDrawRef.current(text);
          void processDrawQueueRef.current();

          addToolOutput({
            tool: "render_text_whiteboard",
            toolCallId: toolCall.toolCallId,
            output: { rendered: true },
          });
        }
      },
    });

  /**
   * Stop generation / reveal mid-stream and hard-cut the assistant message
   * to whatever has already been revealed — so later turns don't keep the
   * truncated tail as context.
   */
  const handleStopGeneration = useCallback(() => {
    stop();

    // Abort any in-flight whiteboard draws
    drawQueueRef.current = [];
    drawingRef.current = false;
    setRevealPaused(false);
    setIsCatchingUpReveal(false);

    const cutoff = revealedText.trimEnd();
    if (!cutoff) return;

    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;

      return [
        ...prev.slice(0, -1),
        {
          ...last,
          parts: [{ type: "text" as const, text: cutoff }],
        },
      ];
    });
  }, [stop, revealedText, setMessages]);

  const isLoading =
    status === "streaming" ||
    status === "submitted" ||
    courseMaterials.isAdding;
  const isAwaitingChatResponse =
    status === "streaming" || status === "submitted";
  const isChatError = status === "error" && !!error;
  const isRateLimited = isChatError && isRateLimitError(error);
  const showGenericChatError = isChatError && !isRateLimited;

  // Restore persisted messages after hydration (client-only)
  useEffect(() => {
    const persisted = loadMessages();
    if (persisted.length > 0) {
      const uiMessages: StepwiseUIMessage[] = persisted.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
        metadata: m.attachments?.length
          ? { attachments: m.attachments }
          : undefined,
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

  // ── Reveal-synced equation + board-text extraction → whiteboard ──────────
  // Keyed off the throttled `revealedText` so items are queued only once
  // the chat has visibly typed that far. The draw queue serialises animation
  // (one at a time) and pauses text reveal while a draw is in flight.
  useEffect(() => {
    if (!revealedText || !editorReady) return;

    let queued = false;

    if (renderLatexOnCanvas) {
      const newEqs = extractNewEquations(
        revealedText,
        renderedEquationsRef.current
      );
      for (const eq of newEqs) {
        if (
          !drawQueueRef.current.some(
            (q) => q.kind === "latex" && q.content.trim() === eq.trim()
          )
        ) {
          drawQueueRef.current.push({ kind: "latex", content: eq });
          queued = true;
        }
      }
    }

    if (renderTextOnCanvas) {
      const newLabels = extractNewBoardText(
        revealedText,
        renderedBoardTextRef.current
      );
      for (const label of newLabels) {
        if (
          !drawQueueRef.current.some(
            (q) =>
              q.kind === "text" &&
              q.content.trim().toLowerCase() === label.trim().toLowerCase()
          )
        ) {
          drawQueueRef.current.push({ kind: "text", content: label });
          queued = true;
        }
      }
    }

    if (queued) void processDrawQueue();
  }, [
    revealedText,
    renderLatexOnCanvas,
    renderTextOnCanvas,
    editorReady,
    processDrawQueue,
  ]);

  /** Pan + zoom the tldraw canvas to the shape linked to `latex`. */
  const focusEquation = useCallback(
    (latex: string) => {
      const shapeId = equationShapeMapRef.current.get(latex.trim());
      if (shapeId && focusLatexShape) {
        focusLatexShape(shapeId);
      }
    },
    [focusLatexShape]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      // Determine if this message escalates to Gemma
      const needsVision = imageFiles.length > 0;
      const effectiveProvider: ChatProvider = needsVision || escalated ? "gemma" : "llm7";

      if (needsVision) {
        setEscalated(true);
        setManuallyDowngraded(false);
      }

      // Build parts array — images as native file parts, text as one text part
      type FilePart = { type: "file"; mediaType: string; url: string };
      type TextPart = { type: "text"; text: string };
      type MessagePart = FilePart | TextPart;

      const parts: MessagePart[] = [];

      // Add image file parts directly — no vision API pre-call
      for (const img of imageFiles) {
        parts.push({ type: "file", mediaType: img.type, url: img.dataUrl });
      }

      // Snapshot enabled course materials into message metadata (server injects for LLM)
      const pdfAttachments: MessagePdfAttachment[] =
        courseMaterials.enabledMaterials.map(toMessageAttachment);

      parts.push({ type: "text", text: trimmed });

      const metadata: StepwiseMessageMetadata | undefined =
        pdfAttachments.length > 0 ? { attachments: pdfAttachments } : undefined;

      const forceWhiteboard = detectWhiteboardIntent(trimmed);

      sendMessage(
        { parts, metadata },
        {
          body: {
            provider: effectiveProvider,
            forceWhiteboard,
            ...buildDevChatBodyFlags(trimmed, devMode, forceLlm7Fail),
          },
        }
      );
      setInput("");
      setFiles([]);
    },
    [
      input,
      files,
      isLoading,
      escalated,
      sendMessage,
      courseMaterials.enabledMaterials,
      devMode,
      forceLlm7Fail,
    ]
  );

  const handleCaptureWhiteboard = useCallback(async () => {
    const payload = await captureWhiteboard();
    if (!payload?.imageDataUrl) return;

    // Whiteboard always uses Gemma (vision) and escalates permanently
    setEscalated(true);
    setManuallyDowngraded(false);

    sendMessage(
      {
        parts: [
          { type: "file" as const, mediaType: "image/png", url: payload.imageDataUrl },
          { type: "text" as const, text: "Here is my whiteboard — please analyse what I've drawn and help me understand it." },
        ],
      },
      { body: { provider: "gemma" satisfies ChatProvider } }
    );
  }, [captureWhiteboard, sendMessage]);

  /** Downgrade to LLM7 after a Gemma rate limit — images in history stay but won't be re-analysed */
  const handleDowngradeToLlm7 = useCallback(() => {
    clearError();
    setEscalated(false);
    setManuallyDowngraded(true);
  }, [clearError]);

  /** Re-run the last user prompt on the current provider. */
  const handleRetry = useCallback(() => {
    const lastUserText = getLastUserText(messages);
    const forceWhiteboard = detectWhiteboardIntent(lastUserText);
    clearError();
    void regenerate({
      body: {
        provider,
        forceWhiteboard,
        ...buildDevChatBodyFlags(lastUserText, devMode, forceLlm7Fail),
      },
    });
  }, [messages, clearError, regenerate, provider, devMode, forceLlm7Fail]);

  /** Escalate a failed LLM7 request to OpenRouter Gemma 4 and regenerate. */
  const handleEscalateToGemma = useCallback(() => {
    const lastUserText = getLastUserText(messages);
    const forceWhiteboard = detectWhiteboardIntent(lastUserText);
    clearError();
    setEscalated(true);
    setManuallyDowngraded(false);
    void regenerate({
      body: {
        provider: "gemma" satisfies ChatProvider,
        forceWhiteboard,
        // Never force-fail Gemma; still allow smoke test if last message was "t"
        ...buildDevChatBodyFlags(lastUserText, devMode, false),
      },
    });
  }, [messages, clearError, regenerate, devMode]);

  const handleDeleteMessage = useCallback(
    (id: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    },
    [setMessages]
  );

  const handleClear = useCallback(() => {
    setEscalated(false);
    setManuallyDowngraded(false);
    clearSession();
    equationShapeMapRef.current.clear();
    renderedEquationsRef.current.clear();
    renderedBoardTextRef.current.clear();
    drawQueueRef.current = [];
    drawingRef.current = false;
    setRevealPaused(false);
    setReadyEquations(new Set());
    void Promise.resolve(onClearWhiteboard?.()).finally(() => {
      window.location.reload();
    });
  }, [clearSession, onClearWhiteboard]);

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
        <div className="flex flex-shrink-0 flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="min-w-0 shrink">
            <h1 className="text-sm font-semibold">Stepwise</h1>
            <p className="text-xs text-muted-foreground">
              {provider === "gemma" ? "Gemma 4 · Vision enabled" : "AI Tutor"}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <TextSpeedSlider value={textSpeed} onChange={handleTextSpeedChange} />
            {latexFontSize !== undefined && onLatexFontSizeChange && (
              <LatexFontSizeSlider
                value={latexFontSize}
                onChange={onLatexFontSizeChange}
              />
            )}
            {wbTextSize !== undefined &&
              onWbTextSizeChange &&
              wbTextColor !== undefined &&
              onWbTextColorChange &&
              wbTextMode !== undefined &&
              onWbTextModeChange && (
                <WhiteboardTextControls
                  size={wbTextSize}
                  onSizeChange={onWbTextSizeChange}
                  color={wbTextColor}
                  onColorChange={onWbTextColorChange}
                  mode={wbTextMode}
                  onModeChange={onWbTextModeChange}
                />
              )}
            <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                aria-label="Clear chat history"
                className="h-9 w-9 flex-shrink-0"
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
          isLoading={isAwaitingChatResponse}
          onDeleteMessage={handleDeleteMessage}
          textSpeed={textSpeed}
          focusEquation={focusEquation}
          onRevealedText={setRevealedText}
          revealPaused={revealPaused}
          readyEquations={readyEquations}
          onCatchingUpChange={setIsCatchingUpReveal}
          typingHoldMs={typingHoldMs}
        />

        {/* Rate limit error banner */}
        {isRateLimited && (
          <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2.5 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Rate limited — try again in a moment
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {formatChatErrorMessage(error, provider)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 min-w-11 gap-1.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    onClick={handleRetry}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  {escalated ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 min-w-11 gap-1.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      onClick={handleDowngradeToLlm7}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Switch to LLM7
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 min-w-11 gap-1.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      onClick={handleEscalateToGemma}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Try Gemma 4 instead
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generic LLM provider failure banner */}
        {showGenericChatError && (
          <div className="mx-3 mb-2 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2.5 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <p className="font-medium text-red-800 dark:text-red-300">
                  LLM API failed
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                  {formatChatErrorMessage(error, provider)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 min-w-11 gap-1.5 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                    onClick={handleRetry}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  {!escalated ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 min-w-11 gap-1.5 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                      onClick={handleEscalateToGemma}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Try Gemma 4 instead
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 min-w-11 gap-1.5 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                      onClick={handleDowngradeToLlm7}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Switch to LLM7
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warning banner shown after manual downgrade */}
        {manuallyDowngraded && !isChatError && (
          <div className="mx-3 mb-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Using <strong>LLM7</strong> (text only). Image and whiteboard analysis unavailable
                — upload an image to re-enable Gemma 4.
              </span>
            </p>
          </div>
        )}

        {/* Course materials + input */}
        <CourseMaterialsBar
          materials={courseMaterials.materials}
          isAdding={courseMaterials.isAdding}
          addError={courseMaterials.addError}
          onAddFromFile={courseMaterials.addFromFile}
          onToggle={courseMaterials.toggleMaterial}
          onRemove={courseMaterials.removeMaterial}
          onClearAddError={courseMaterials.clearAddError}
        />
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={handleStopGeneration}
          isLoading={isLoading || revealPaused || isCatchingUpReveal}
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
