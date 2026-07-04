"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
  onDeleteMessage: (id: string) => void;
}

export function ChatMessages({ messages, isLoading, onDeleteMessage }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastMsg = messages[messages.length - 1];
  const lastAssistantTextLen =
    lastMsg?.role === "assistant"
      ? lastMsg.parts
          .filter((p) => p.type === "text")
          .map((p) => (p.type === "text" ? p.text.length : 0))
          .reduce((a, b) => a + b, 0)
      : 0;
  const awaitingFirstToken =
    isLoading &&
    (messages.length === 0 ||
      lastMsg?.role === "user" ||
      lastAssistantTextLen === 0);
  const isStreaming =
    isLoading && lastMsg?.role === "assistant" && lastAssistantTextLen > 0;

  useEffect(() => {
    const viewport = bottomRef.current?.closest(
      "[data-radix-scroll-area-viewport]"
    );

    if (viewport instanceof HTMLElement) {
      if (isStreaming) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isLoading, isStreaming]);

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
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onDelete={onDeleteMessage}
          />
        ))}

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
