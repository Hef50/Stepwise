"use client";

import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  className?: string;
}

/** iMessage-style bouncing dots while waiting for the first LLM token. */
export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div
      className={cn("flex gap-3 px-1", className)}
      role="status"
      aria-live="polite"
      aria-label="Tutor is typing"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Bot className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 shadow-sm">
        <span className="h-2 w-2 animate-typing-dot rounded-full bg-muted-foreground/55" />
        <span className="h-2 w-2 animate-typing-dot rounded-full bg-muted-foreground/55 [animation-delay:0.18s]" />
        <span className="h-2 w-2 animate-typing-dot rounded-full bg-muted-foreground/55 [animation-delay:0.36s]" />
      </div>
    </div>
  );
}
