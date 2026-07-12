"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";
import { useTextReveal } from "@/hooks/useTextReveal";
import { speedToCharsPerSecond } from "@/lib/chat/textReveal";
import { stripIncompleteMathDelimiters } from "@/lib/chat/extractEquations";

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
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
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
  const lastDisplayedRaw = useTextReveal(
    lastAssistantFullText,
    isLiveAssistant ? charsPerSecond : null,
    isLiveAssistant ? lastMsg.id : undefined,
    revealPaused
  );
  // Never flash `$$` / unclosed math in the chat UI
  const lastDisplayedText = isLiveAssistant
    ? stripIncompleteMathDelimiters(lastDisplayedRaw)
    : lastDisplayedRaw;

  // Report the *raw* reveal (including complete math) so extraction can fire
  // as soon as an equation closes — even while display hides the delimiters.
  useEffect(() => {
    if (onRevealedText && lastMsg?.role === "assistant") {
      onRevealedText(isLiveAssistant ? lastDisplayedRaw : lastAssistantFullText);
    }
  }, [
    onRevealedText,
    lastDisplayedRaw,
    lastAssistantFullText,
    isLiveAssistant,
    lastMsg?.role,
  ]);

  const lastAssistantTextLen = lastAssistantFullText.length;
  const lastDisplayedLen = lastDisplayedText.length;
  const awaitingFirstToken =
    isLoading &&
    (messages.length === 0 ||
      lastMsg?.role === "user" ||
      lastAssistantTextLen === 0);
  const isStreaming =
    isLoading && lastMsg?.role === "assistant" && lastDisplayedLen > 0;
  const isCatchingUp =
    !isLoading &&
    lastMsg?.role === "assistant" &&
    charsPerSecond !== null &&
    lastDisplayedLen < lastAssistantTextLen;

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
  }, [messages, isLoading, isStreaming, isCatchingUp, lastDisplayedLen]);

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

        {awaitingFirstToken && (
          <div className="flex gap-3 px-1">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[80%] space-y-2 rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
