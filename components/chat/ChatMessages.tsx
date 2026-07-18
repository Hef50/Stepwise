"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Bot } from "lucide-react";
import { useTextReveal } from "@/hooks/useTextReveal";
import { speedToCharsPerSecond } from "@/lib/chat/textReveal";
import { stripIncompleteMathDelimiters } from "@/lib/chat/extractEquations";
import { sanitizeBoardTextForDisplay } from "@/lib/chat/extractBoardText";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
  onDeleteMessage: (id: string) => void;
  textSpeed: number;
  /** Called when the user clicks "Go to equation" for a given latex string. */
  focusEquation?: (latex: string) => void;
  /**
   * Reports the currently *revealed* (throttled) assistant text so equation
   * extraction stays in sync with the chat reveal instead of the raw stream.
   */
  onRevealedText?: (text: string) => void;
  /** When true, freeze the text reveal (whiteboard is drawing an equation). */
  revealPaused?: boolean;
  /** Equations that finished drawing — cards appear only for these while live. */
  readyEquations?: ReadonlySet<string>;
  /** Reports whether the reveal is still catching up after the LLM finished. */
  onCatchingUpChange?: (catchingUp: boolean) => void;
  /**
   * Dev Mode: keep the typing indicator visible for at least this many ms
   * after a request starts, even if tokens arrive sooner.
   */
  typingHoldMs?: number;
}

function getAssistantText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

const STICK_BOTTOM_PX = 96;

export function ChatMessages({
  messages,
  isLoading,
  onDeleteMessage,
  textSpeed,
  focusEquation,
  onRevealedText,
  revealPaused = false,
  readyEquations,
  onCatchingUpChange,
  typingHoldMs = 0,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const typingHoldTimerRef = useRef<number | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  /** Dev Mode: true while the artificial typing hold is still running. */
  const [typingHoldActive, setTypingHoldActive] = useState(false);
  const charsPerSecond = speedToCharsPerSecond(textSpeed);

  const lastMsg = messages[messages.length - 1];

  if (
    isLoading &&
    lastMsg?.role === "assistant" &&
    streamingMessageId !== lastMsg.id
  ) {
    setStreamingMessageId(lastMsg.id);
  }

  const isLiveAssistant =
    lastMsg?.role === "assistant" && streamingMessageId === lastMsg.id;

  const lastAssistantFullText =
    lastMsg?.role === "assistant" ? getAssistantText(lastMsg) : "";
  const lastAssistantTextLen = lastAssistantFullText.length;

  const awaitingFirstToken =
    isLoading &&
    (messages.length === 0 ||
      lastMsg?.role === "user" ||
      lastAssistantTextLen === 0);

  // Keep dots up for the hold duration even after tokens arrive / stream ends.
  // Drop the hold immediately on error/abort (loading ended, no assistant text).
  const showTypingIndicator =
    awaitingFirstToken ||
    (typingHoldActive && isLoading) ||
    (typingHoldActive && lastAssistantTextLen > 0);

  // Hold the typing indicator for a minimum duration in Dev Mode — gate reveal
  // so text doesn't flash behind the dots.
  const gatedAssistantText = showTypingIndicator ? "" : lastAssistantFullText;

  const lastDisplayedRaw = useTextReveal(
    gatedAssistantText,
    isLiveAssistant ? charsPerSecond : null,
    isLiveAssistant ? lastMsg.id : undefined,
    revealPaused
  );
  // Never flash `$$` / unclosed math or `[[board:` markers in the chat UI
  const lastDisplayedText = isLiveAssistant
    ? sanitizeBoardTextForDisplay(
        stripIncompleteMathDelimiters(lastDisplayedRaw)
      )
    : sanitizeBoardTextForDisplay(lastDisplayedRaw);

  // Report the *raw* reveal (including complete math) so extraction can fire
  // as soon as an equation closes — even while display hides the delimiters.
  // Skip while the typing indicator is up so we don't clear whiteboard state.
  useEffect(() => {
    if (showTypingIndicator) return;
    if (onRevealedText && lastMsg?.role === "assistant") {
      onRevealedText(isLiveAssistant ? lastDisplayedRaw : lastAssistantFullText);
    }
  }, [
    onRevealedText,
    lastDisplayedRaw,
    lastAssistantFullText,
    isLiveAssistant,
    lastMsg?.role,
    showTypingIndicator,
  ]);

  // Start a Dev Mode typing hold whenever a generation begins. Do not clear the
  // timer when loading ends early — that is what prolongs the animation.
  useEffect(() => {
    if (!isLoading) return;

    if (typingHoldTimerRef.current !== null) {
      window.clearTimeout(typingHoldTimerRef.current);
      typingHoldTimerRef.current = null;
    }

    if (typingHoldMs <= 0) {
      setTypingHoldActive(false);
      return;
    }

    setTypingHoldActive(true);
    typingHoldTimerRef.current = window.setTimeout(() => {
      typingHoldTimerRef.current = null;
      setTypingHoldActive(false);
    }, typingHoldMs);
  }, [isLoading, typingHoldMs]);

  // Cancel hold on failure / abort (no assistant content to reveal).
  useEffect(() => {
    if (isLoading || lastAssistantTextLen > 0 || !typingHoldActive) return;
    if (typingHoldTimerRef.current !== null) {
      window.clearTimeout(typingHoldTimerRef.current);
      typingHoldTimerRef.current = null;
    }
    setTypingHoldActive(false);
  }, [isLoading, lastAssistantTextLen, typingHoldActive]);

  useEffect(() => {
    return () => {
      if (typingHoldTimerRef.current !== null) {
        window.clearTimeout(typingHoldTimerRef.current);
      }
    };
  }, []);

  // Compare raw reveal → raw full. Sanitized display is shorter when board
  // markers exist, which would falsely keep "catching up" forever.
  const lastRevealedRawLen = lastDisplayedRaw.length;
  const isStreaming =
    isLoading &&
    !showTypingIndicator &&
    lastMsg?.role === "assistant" &&
    lastRevealedRawLen > 0;
  const isCatchingUp =
    !isLoading &&
    !showTypingIndicator &&
    lastMsg?.role === "assistant" &&
    charsPerSecond !== null &&
    lastRevealedRawLen < lastAssistantTextLen;

  useEffect(() => {
    onCatchingUpChange?.(isCatchingUp);
  }, [isCatchingUp, onCatchingUpChange]);

  // Re-pin to bottom when a new generation starts
  useEffect(() => {
    if (isLoading) stickToBottomRef.current = true;
  }, [isLoading]);

  // Track whether the user is pinned near the bottom. If they scroll up,
  // stop forcing the viewport down so they can read earlier messages.
  useEffect(() => {
    const viewport = bottomRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    );
    if (!(viewport instanceof HTMLElement)) return;

    const onScroll = () => {
      const dist =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = dist < STICK_BOTTOM_PX;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [messages.length === 0 && !isLoading]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;

    const viewport = bottomRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    );

    if (viewport instanceof HTMLElement) {
      if (isStreaming || isCatchingUp) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isLoading, isStreaming, isCatchingUp, lastRevealedRawLen, showTypingIndicator]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Stepwise AI Tutor</p>
          <p className="mt-1 text-sm">
            Ask me anything — I can explain concepts, draw diagrams, and analyze
            your whiteboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-3">
      <div className="space-y-4 py-4">
        {messages.map((message, index) => {
          const isLive =
            index === messages.length - 1 &&
            message.role === "assistant" &&
            isLiveAssistant;

          // Hide the live assistant bubble while the typing indicator is up
          // (empty stream stub, or Dev Mode hold with tokens buffered).
          if (isLive && showTypingIndicator) {
            return null;
          }

          const hideUntilReady =
            isLive && (isLoading || revealPaused || isCatchingUp);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              onDelete={onDeleteMessage}
              textOverride={isLive ? lastDisplayedText : undefined}
              focusEquation={focusEquation}
              readyEquations={isLive ? readyEquations : undefined}
              hideUntilReady={hideUntilReady}
            />
          );
        })}

        {showTypingIndicator && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
