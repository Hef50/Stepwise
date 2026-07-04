import type { MessagePdfAttachment, StepwiseMessageMetadata } from "@/lib/types";
import type { UIMessage } from "ai";

/** Max characters of PDF text sent to the model per attachment */
export const PDF_CONTEXT_CHAR_LIMIT = 8000;

export function getPdfAttachments(metadata: unknown): MessagePdfAttachment[] {
  if (
    metadata &&
    typeof metadata === "object" &&
    "attachments" in metadata &&
    Array.isArray((metadata as StepwiseMessageMetadata).attachments)
  ) {
    return (metadata as StepwiseMessageMetadata).attachments ?? [];
  }
  return [];
}

export function buildPdfContextBlock(attachment: MessagePdfAttachment): string {
  const truncated =
    attachment.text.length > PDF_CONTEXT_CHAR_LIMIT
      ? attachment.text.slice(0, PDF_CONTEXT_CHAR_LIMIT) + "\n…[truncated]"
      : attachment.text;
  const pageLabel = attachment.pageCount === 1 ? "page" : "pages";
  return `[Attached PDF: ${attachment.name} (${attachment.pageCount} ${pageLabel})]\n${truncated}`;
}

/**
 * Injects PDF context from message metadata into user text parts before the
 * model sees them. The UI text parts stay unchanged — this runs server-side only.
 */
export function enrichMessagesWithPdfContext(
  messages: UIMessage[]
): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;

    const attachments = getPdfAttachments(message.metadata);
    if (attachments.length === 0) return message;

    const pdfContext = attachments.map(buildPdfContextBlock).join("\n\n");

    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "text") return part;
        return {
          ...part,
          text: `${pdfContext}\n\n${part.text}`,
        };
      }),
    };
  });
}
