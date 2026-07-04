"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { PdfTextViewer } from "@/components/chat/PdfTextViewer";
import type { MessagePdfAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessagePdfAttachmentsProps {
  attachments: MessagePdfAttachment[];
  /** When true, chips use light-on-primary styling for user bubbles */
  onPrimaryBackground?: boolean;
}

export function MessagePdfAttachments({
  attachments,
  onPrimaryBackground = false,
}: MessagePdfAttachmentsProps) {
  const [viewing, setViewing] = useState<MessagePdfAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            type="button"
            onClick={() => setViewing(attachment)}
            className={cn(
              "flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
              onPrimaryBackground
                ? "border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20"
                : "border-border bg-background hover:bg-muted"
            )}
            aria-label={`View attached PDF: ${attachment.name}`}
          >
            <FileText
              className={cn(
                "h-4 w-4 flex-shrink-0",
                onPrimaryBackground ? "text-primary-foreground/90" : "text-orange-500"
              )}
            />
            <span className="truncate font-medium">{attachment.name}</span>
            <span
              className={cn(
                "flex-shrink-0",
                onPrimaryBackground ? "text-primary-foreground/70" : "text-muted-foreground"
              )}
            >
              {attachment.pageCount} {attachment.pageCount === 1 ? "page" : "pages"}
            </span>
          </button>
        ))}
      </div>

      {viewing && (
        <PdfTextViewer
          name={viewing.name}
          pageCount={viewing.pageCount}
          text={viewing.text}
          open={viewing !== null}
          onOpenChange={(open) => !open && setViewing(null)}
        />
      )}
    </>
  );
}
