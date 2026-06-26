"use client";

import type { UIMessage } from "ai";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageRenderer } from "@/components/diagrams/MessageRenderer";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  return (
    <div
      className={cn(
        "flex gap-3 px-1",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{textContent}</p>
        ) : (
          <MessageRenderer content={textContent} />
        )}
      </div>
    </div>
  );
}
