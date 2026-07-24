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
import { CourseMaterialsDialog } from "./CourseMaterialsDialog";
import { useVoiceTA } from "@/hooks/useVoiceTA";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useCourseMaterials, toMessageAttachment } from "@/hooks/useCourseMaterials";
import { detectWhiteboardIntent } from "@/lib/chat/whiteboardIntent";
import { extractNewEquations } from "@/lib/chat/extractEquations";
import { extractNewBoardText } from "@/lib/chat/extractBoardText";
import { extractNewDiagrams } from "@/lib/chat/extractDiagrams";
import {
  diagramSpecKey,
  parseDiagramSpec,
  type DiagramSpec,
} from "@/lib/whiteboard/diagramSpec";
import { DEFAULT_CPS } from "@/lib/chat/textReveal";
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

/** Parse a DiagramSpec from a JSON string or unknown value; null on failure. */
function parseDiagramSpecSafe(raw: unknown): DiagramSpec | null {
  if (typeof raw === "string") {
    try {
      return parseDiagramSpec(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return parseDiagramSpec(raw);
}

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  /** Routes a LaTeX string to the tldraw canvas as an animated shape. Returns the created shape id or null. */
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /** Routes short handwritten text to the tldraw canvas. Returns the created shape id or null. */
  renderTextOnCanvas?: (text: string) => Promise<string | null>;
  /** Routes a diagram spec (object or JSON string) to the tldraw canvas. */
  renderDiagramOnCanvas?: (
    specOrJson: DiagramSpec | string
  ) => Promise<string | null>;
  /** Pan + zoom the canvas to focus on the given tldraw shape id. */
  focusLatexShape?: (shapeId: string) => void;
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
  /** Chat reveal speed (cps) — controlled by the whiteboard settings overlay. */
  textSpeed?: number;
  /** Mixed mode adds browser speech around the same chat and whiteboard flow. */
  interactionMode?: "text" | "mixed";
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
  renderDiagramOnCanvas,
  focusLatexShape,
  onClearWhiteboard,
  editorReady = false,
  onActiveModelChange,
  devMode = false,
  forceLlm7Fail = false,
  typingHoldMs = 0,
  textSpeed = DEFAULT_CPS,
  interactionMode = "text",
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  /** Once true, all subsequent messages in this session use Gemma via OpenRouter */
  const [escalated, setEscalated] = useState(false);
  /** True if the user manually downgraded from Gemma to LLM7 to escape a rate limit */
  const [manuallyDowngraded, setManuallyDowngraded] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [isCatchingUpReveal, setIsCatchingUpReveal] = useState(false);
  const [isPreparingWhiteboard, setIsPreparingWhiteboard] = useState(false);
  const submitMixedRef = useRef<(text: string) => void>(() => {});
  const voice = useVoiceTA((transcript) => {
    if (interactionMode !== "mixed") return;
    setInput(transcript);
    submitMixedRef.current(transcript);
  });
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();
  const courseMaterials = useCourseMaterials();

  // ── Equation / text canvas sync ──────────────────────────────────────────
  /** Equations already rendered on the whiteboard (normalized latex → shapeId) */
  const equationShapeMapRef = useRef<Map<string, string>>(new Map());
  /** Set of normalized latex strings sent to the whiteboard (prevents re-sending) */
  const renderedEquationsRef = useRef<Set<string>>(new Set());
  /** Set of normalized board-text labels already sent (prevents re-sending) */
  const renderedBoardTextRef = useRef<Set<string>>(new Set());
  /** Set of diagram spec keys already sent (prevents re-sending) */
  const renderedDiagramsRef = useRef<Set<string>>(new Set());
  /** Throttled reveal text from ChatMessages — extraction keys off this, not the raw stream. */
  const [revealedText, setRevealedText] = useState("");
  /**
   * Serial draw queue: at most one shape animates at a time, and text reveal
   * is paused while a draw is in flight. Preserves latex/text/diagram emission order.
   */
  const drawQueueRef = useRef<WhiteboardDrawQueueItem[]>([]);
  const drawingRef = useRef(false);
  const [revealPaused, setRevealPaused] = useState(false);
  /** Latex strings whose whiteboard draw has finished — unlocks chat cards. */
  const [readyEquations, setReadyEquations] = useState<Set<string>>(
    () => new Set()
  );
  const renderLatexRef = useRef(renderLatexOnCanvas);
  const renderTextRef = useRef(renderTextOnCanvas);
  const renderDiagramRef = useRef(renderDiagramOnCanvas);

  useEffect(() => {
    renderLatexRef.current = renderLatexOnCanvas;
    renderTextRef.current = renderTextOnCanvas;
    renderDiagramRef.current = renderDiagramOnCanvas;
  }, [renderLatexOnCanvas, renderTextOnCanvas, renderDiagramOnCanvas]);

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

  const enqueueDiagramDraw = useCallback((spec: DiagramSpec | string) => {
    let content: string;
    let key: string;
    if (typeof spec === "string") {
      content = spec;
      try {
        const parsed = parseDiagramSpecSafe(spec);
        if (!parsed) return;
        key = diagramSpecKey(parsed);
        content = JSON.stringify(parsed);
      } catch {
        return;
      }
    } else {
      key = diagramSpecKey(spec);
      content = JSON.stringify(spec);
    }
    if (renderedDiagramsRef.current.has(key)) return;
    if (
      drawQueueRef.current.some(
        (q) => q.kind === "diagram" && q.content === content
      )
    ) {
      return;
    }
    renderedDiagramsRef.current.add(key);
    drawQueueRef.current.push({ kind: "diagram", content });
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
        } else if (item.kind === "text") {
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
        } else {
          const render = renderDiagramRef.current;
          if (!render) {
            try {
              const parsed = JSON.parse(item.content) as unknown;
              const spec = parseDiagramSpecSafe(parsed);
              if (spec) renderedDiagramsRef.current.delete(diagramSpecKey(spec));
            } catch {
              // ignore
            }
            continue;
          }
          const shapeId = await render(item.content);
          if (!shapeId) {
            try {
              const parsed = JSON.parse(item.content) as unknown;
              const spec = parseDiagramSpecSafe(parsed);
              if (spec) renderedDiagramsRef.current.delete(diagramSpecKey(spec));
            } catch {
              // ignore
            }
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
  const enqueueTextDrawRef = useRef(enqueueTextDraw);
  const enqueueDiagramDrawRef = useRef(enqueueDiagramDraw);
  const processDrawQueueRef = useRef(processDrawQueue);

  useEffect(() => {
    enqueueLatexDrawRef.current = enqueueLatexDraw;
    enqueueTextDrawRef.current = enqueueTextDraw;
    enqueueDiagramDrawRef.current = enqueueDiagramDraw;
    processDrawQueueRef.current = processDrawQueue;
  }, [enqueueLatexDraw, enqueueTextDraw, enqueueDiagramDraw, processDrawQueue]);

  // Tool calls can arrive before the dynamically loaded tldraw editor mounts.
  // Keep those queued shapes and render them as soon as the editor is available.
  useEffect(() => {
    if (editorReady && drawQueueRef.current.length > 0) {
      void processDrawQueue();
    }
  }, [editorReady, processDrawQueue]);

  const provider: ChatProvider = escalated ? "gemma" : "llm7";

  // Notify parent when active model changes
  useEffect(() => {
    onActiveModelChange?.(escalated ? "gemma" : "llm7");
  }, [escalated, onActiveModelChange]);

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

        if (toolCall.toolName === "render_diagram_whiteboard") {
          const input = toolCall.input as DiagramSpec;
          enqueueDiagramDrawRef.current(input);
          void processDrawQueueRef.current();

          addToolOutput({
            tool: "render_diagram_whiteboard",
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

  // ── ASAP diagram extraction from the raw stream (not reveal-throttled) ──
  // Diagram JSON is large; waiting for char-reveal made drawing feel lagged.
  // As soon as a complete [[diagram:…]] lands in the assistant message (or a
  // tool call fires), enqueue it so compile + stroke animation start immediately.
  useEffect(() => {
    if (!editorReady || !renderDiagramOnCanvas) return;

    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const fullText = lastAssistant.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!fullText) return;

    let queued = false;
    const newDiagrams = extractNewDiagrams(
      fullText,
      renderedDiagramsRef.current
    );
    for (const spec of newDiagrams) {
      const content = JSON.stringify(spec);
      if (
        !drawQueueRef.current.some(
          (q) => q.kind === "diagram" && q.content === content
        )
      ) {
        drawQueueRef.current.push({ kind: "diagram", content });
        queued = true;
      }
    }
    if (queued) void processDrawQueue();
  }, [messages, editorReady, renderDiagramOnCanvas, processDrawQueue]);

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

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || isPreparingWhiteboard) return;

      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const forceWhiteboard = detectWhiteboardIntent(trimmed);

      // Text and Mixed mode share the current board automatically when it has
      // content. This keeps a written problem and the user's typed question in
      // the same vision request instead of requiring a separate camera action.
      setIsPreparingWhiteboard(true);
      const whiteboardPayload = await captureWhiteboard().catch(() => null);
      setIsPreparingWhiteboard(false);
      const whiteboardImage = whiteboardPayload?.imageDataUrl;

      // Vision and explicit draw requests require Gemma's actual tool calls.
      // LLM7 remains the inexpensive text-only path when neither is needed.
      const needsVision = imageFiles.length > 0 || Boolean(whiteboardImage);
      const effectiveProvider: ChatProvider =
        needsVision || forceWhiteboard || escalated ? "gemma" : "llm7";

      if (needsVision || forceWhiteboard) {
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
      if (whiteboardImage) {
        parts.push({ type: "file", mediaType: "image/png", url: whiteboardImage });
      }

      // Snapshot enabled course materials into message metadata (server injects for LLM)
      const pdfAttachments: MessagePdfAttachment[] =
        courseMaterials.enabledMaterials.map(toMessageAttachment);

      parts.push({ type: "text", text: trimmed });

      const metadata: StepwiseMessageMetadata | undefined =
        pdfAttachments.length > 0 ? { attachments: pdfAttachments } : undefined;

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
      files,
      isLoading,
      isPreparingWhiteboard,
      escalated,
      captureWhiteboard,
      sendMessage,
      courseMaterials.enabledMaterials,
      devMode,
      forceLlm7Fail,
    ]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitText(input);
    },
    [input, submitText]
  );

  useEffect(() => {
    submitMixedRef.current = (text) => void submitText(text);
  }, [submitText]);

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
    renderedDiagramsRef.current.clear();
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

  const { enqueueSpeech, cancelSpeech } = voice;
  const lastSpokenMessageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      interactionMode !== "mixed" ||
      !lastAssistantMsg?.id ||
      !lastAssistantText ||
      isAwaitingChatResponse ||
      !voice.state.soundEnabled ||
      lastSpokenMessageRef.current === lastAssistantMsg.id
    ) {
      return;
    }
    lastSpokenMessageRef.current = lastAssistantMsg.id;
    enqueueSpeech(lastAssistantText);
  }, [enqueueSpeech, interactionMode, isAwaitingChatResponse, lastAssistantMsg?.id, lastAssistantText, voice.state.soundEnabled]);

  useEffect(() => {
    if (interactionMode === "mixed") return;
    cancelSpeech();
  }, [cancelSpeech, interactionMode]);

  return (
    <TooltipProvider>
      <div className="relative flex h-full flex-col overflow-hidden">
        {/* Header — slim: title + clear (settings live bottom-right of app) */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="min-w-0 shrink">
            <h1 className="text-sm font-semibold">Stepwise</h1>
            <p className="text-xs text-muted-foreground">
              {provider === "gemma" ? "Gemma 4 · Vision enabled" : "AI Tutor"}
            </p>
          </div>
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

        <Separator />

        <div className="relative min-h-0 flex-1 overflow-hidden">
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
        </div>

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

        {/* Course materials dialog + input */}
        <CourseMaterialsDialog
          open={materialsOpen}
          onOpenChange={setMaterialsOpen}
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
          isLoading={isLoading || isPreparingWhiteboard || revealPaused || isCatchingUpReveal}
          voice={voice}
          files={files}
          onFilesChange={setFiles}
          onCaptureWhiteboard={handleCaptureWhiteboard}
          onOpenCourseMaterials={() => setMaterialsOpen(true)}
          courseMaterialsActiveCount={
            courseMaterials.materials.filter((m) => m.enabled).length
          }
          lastAssistantMessage={lastAssistantText}
          showVoiceControls={interactionMode === "mixed"}
        />
      </div>
    </TooltipProvider>
  );
}
