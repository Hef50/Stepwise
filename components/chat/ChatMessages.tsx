"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";
import type { WhiteboardShapeInstruction } from "@/lib/types";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
  onDeleteMessage: (id: string) => void;
  onSendToWhiteboard: (instructions: WhiteboardShapeInstruction[]) => void;
}

export function ChatMessages({
  messages,
  isLoading,
  onDeleteMessage,
  onSendToWhiteboard,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content, but ONLY when the user is already near
  // the bottom. Using instant (non-smooth) scrolling avoids the jarring up/down
  // snapping that smooth-scroll causes while tokens stream in rapidly.
  useEffect(() => {
    const root = scrollRootRef.current;
    const viewport = root?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    // Only follow the stream if the user hasn't scrolled up to read history.
    if (distanceFromBottom < 120) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

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
    <ScrollArea ref={scrollRootRef} className="flex-1 px-3">
      <div className="space-y-4 py-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onDelete={onDeleteMessage}
            onSendToWhiteboard={onSendToWhiteboard}
          />
        ))}

        {isLoading && (
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
