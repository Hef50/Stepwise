"use client";

import type { UIMessage } from "ai";
import { Bot, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPdfAttachments } from "@/lib/chat/pdfAttachments";
import { MessageRenderer } from "@/components/diagrams/MessageRenderer";
import { MessagePdfAttachments } from "@/components/chat/MessagePdfAttachments";
import { Button } from "@/components/ui/button";

interface MessageBubbleProps {
  message: UIMessage;
  onDelete: (id: string) => void;
  /** When set, overrides the message text (e.g. throttled stream reveal). */
  textOverride?: string;
}

export function MessageBubble({ message, onDelete, textOverride }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const textContent =
    textOverride ??
    message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");

  const imageParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "file" }> => p.type === "file"
  );

  const pdfAttachments = isUser ? getPdfAttachments(message.metadata) : [];

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-1",
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

      {/* Bubble + delete button */}
      <div className={cn("flex items-start gap-1", isUser ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-secondary text-secondary-foreground"
          )}
        >
          {/* Image thumbnails for user messages */}
          {isUser && imageParts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {imageParts.map((part, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={"url" in part ? part.url : ""}
                  alt={`Attached image ${i + 1}`}
                  className="h-24 w-24 rounded-lg object-cover border border-primary-foreground/20"
                />
              ))}
            </div>
          )}

          {/* PDF attachment chips */}
          {isUser && pdfAttachments.length > 0 && (
            <MessagePdfAttachments
              attachments={pdfAttachments}
              onPrimaryBackground
            />
          )}

          {isUser ? (
            textContent ? (
              <p className="whitespace-pre-wrap leading-relaxed">{textContent}</p>
            ) : null
          ) : (
            <MessageRenderer content={textContent} />
          )}
        </div>

        {/* Delete button — revealed on hover */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(message.id)}
          aria-label="Delete message"
          className="h-6 w-6 flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
