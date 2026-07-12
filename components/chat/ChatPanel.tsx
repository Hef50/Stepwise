"use client";

import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertTriangle, Trash2, Zap } from "lucide-react";
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
import { loadTextSpeed, saveTextSpeed } from "@/lib/chat/textReveal";
import { useVoiceTA } from "@/hooks/useVoiceTA";
import { useChatPersistence } from "@/hooks/useChatPersistence";
import { useCourseMaterials, toMessageAttachment } from "@/hooks/useCourseMaterials";
import { detectWhiteboardIntent } from "@/lib/chat/whiteboardIntent";
import { extractNewEquations } from "@/lib/chat/extractEquations";
import type {
  UploadedFile,
  CanvasPayload,
  ActiveModel,
  ChatProvider,
  MessagePdfAttachment,
  StepwiseMessageMetadata,
} from "@/lib/types";

type StepwiseUIMessage = UIMessage<StepwiseMessageMetadata>;

interface ChatPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  /** Routes a LaTeX string to the tldraw canvas as an animated shape. Returns the created shape id or null. */
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  /** Pan + zoom the canvas to focus on the given tldraw shape id. */
  focusLatexShape?: (shapeId: string) => void;
  onActiveModelChange?: (model: ActiveModel) => void;
}

function isRateLimitError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    msg.includes("GEMMA_RATE_LIMITED") ||
    msg.includes("429") ||
    msg.toLowerCase().includes("rate")
  );
}

export function ChatPanel({
  captureWhiteboard,
  renderLatexOnCanvas,
  focusLatexShape,
  onActiveModelChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  /** Once true, all subsequent messages in this session use Gemma via OpenRouter */
  const [escalated, setEscalated] = useState(false);
  /** True if the user manually downgraded from Gemma to LLM7 to escape a rate limit */
  const [manuallyDowngraded, setManuallyDowngraded] = useState(false);
  const [textSpeed, setTextSpeed] = useState(loadTextSpeed);
  const voice = useVoiceTA();
  const { loadMessages, saveMessages, clearSession } = useChatPersistence();
  const courseMaterials = useCourseMaterials();

  // ── Equation canvas sync ─────────────────────────────────────────────────
  /** Equations already rendered on the whiteboard (normalized latex → shapeId) */
  const equationShapeMapRef = useRef<Map<string, string>>(new Map());
  /** Set of normalized latex strings sent to the whiteboard (prevents re-sending) */
  const renderedEquationsRef = useRef<Set<string>>(new Set());
  /** Throttled reveal text from ChatMessages — extraction keys off this, not the raw stream. */
  const [revealedText, setRevealedText] = useState("");

  const provider: ChatProvider = escalated ? "gemma" : "llm7";

  // Notify parent when active model changes
  useEffect(() => {
    onActiveModelChange?.(escalated ? "gemma" : "llm7");
  }, [escalated, onActiveModelChange]);

  const handleTextSpeedChange = useCallback((speed: number) => {
    setTextSpeed(speed);
    saveTextSpeed(speed);
  }, []);

  const { messages, sendMessage, setMessages, status, stop, error, addToolOutput } =
    useChat<StepwiseUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
      messages: [],

      async onToolCall({ toolCall }) {
        // Guard required by AI SDK: dynamic tools must be handled separately
        if (toolCall.dynamic) return;

        if (toolCall.toolName === "render_math_whiteboard") {
          const { latex, displayMode } = toolCall.input as {
            latex: string;
            displayMode?: boolean;
          };

          // Route the LaTeX to the canvas and store the resulting shape id
          if (renderLatexOnCanvas) {
            void renderLatexOnCanvas(latex, displayMode).then((shapeId) => {
              if (shapeId) {
                equationShapeMapRef.current.set(latex.trim(), shapeId);
              }
            });
          }

          // Acknowledge the tool call immediately so the AI stream can continue
          addToolOutput({
            tool: "render_math_whiteboard",
            toolCallId: toolCall.toolCallId,
            output: { rendered: true },
          });
        }
      },
    });

  const isLoading =
    status === "streaming" ||
    status === "submitted" ||
    courseMaterials.isAdding;
  const isRateLimited = status === "error" && escalated && isRateLimitError(error);

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

  // ── Reveal-synced equation extraction → whiteboard ───────────────────────
  // Keyed off the throttled `revealedText` (not the raw stream) so equations are
  // placed on the canvas only once the chat has visibly typed that far.
  // extractNewEquations only returns equations not yet in renderedEquationsRef,
  // so each unique equation is placed on the canvas exactly once.
  useEffect(() => {
    if (!renderLatexOnCanvas || !revealedText) return;

    const newEqs = extractNewEquations(revealedText, renderedEquationsRef.current);
    for (const eq of newEqs) {
      void renderLatexOnCanvas(eq, true).then((shapeId) => {
        if (shapeId) {
          equationShapeMapRef.current.set(eq.trim(), shapeId);
        }
      });
    }
  }, [revealedText, renderLatexOnCanvas]);

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
        { body: { provider: effectiveProvider, forceWhiteboard } }
      );
      setInput("");
      setFiles([]);
    },
    [input, files, isLoading, escalated, sendMessage, courseMaterials.enabledMaterials]
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
    setEscalated(false);
    setManuallyDowngraded(true);
  }, []);

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
            <p className="text-xs text-muted-foreground">
              {provider === "gemma" ? "Gemma 4 · Vision enabled" : "AI Tutor"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <TextSpeedSlider value={textSpeed} onChange={handleTextSpeedChange} />
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
          textSpeed={textSpeed}
          focusEquation={focusEquation}
          onRevealedText={setRevealedText}
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
                  Gemma 4 (free tier) is temporarily overloaded.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    onClick={handleDowngradeToLlm7}
                  >
                    <Zap className="h-3 w-3" />
                    Switch to LLM7
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warning banner shown after manual downgrade */}
        {manuallyDowngraded && !isRateLimited && (
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
