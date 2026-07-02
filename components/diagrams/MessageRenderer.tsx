"use client";

import { useMemo } from "react";
import { LayoutPanelLeft } from "lucide-react";
import { parseMessageBlocks } from "@/lib/markdown/parseBlocks";
import { MermaidDiagram } from "./MermaidDiagram";
import { SchemdrawDiagram } from "./SchemdrawDiagram";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Button } from "@/components/ui/button";
import type { WhiteboardShapeInstruction, WhiteboardShapeKind } from "@/lib/types";

const DIAGRAM_TO_KIND: Record<string, WhiteboardShapeKind> = {
  mermaid: "mermaid",
  schemdraw: "schemdraw",
};

interface MessageRendererProps {
  content: string;
  onSendToWhiteboard: (instructions: WhiteboardShapeInstruction[]) => void;
}

export function MessageRenderer({ content, onSendToWhiteboard }: MessageRendererProps) {
  const blocks = useMemo(() => parseMessageBlocks(content), [content]);

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => {
        if (block.kind === "text") {
          return (
            <div
              key={index}
              className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap leading-relaxed"
            >
              {block.content}
            </div>
          );
        }

        if (block.diagramType === "mermaid") {
          return (
            <ErrorBoundary key={index} label="Mermaid Diagram">
              <div className="relative group/diagram">
                <MermaidDiagram code={block.code} />
                <SendToWhiteboardButton
                  onClick={() =>
                    onSendToWhiteboard([
                      { kind: DIAGRAM_TO_KIND[block.diagramType], content: block.code },
                    ])
                  }
                />
              </div>
            </ErrorBoundary>
          );
        }

        if (block.diagramType === "schemdraw") {
          return (
            <ErrorBoundary key={index} label="Schemdraw Diagram">
              <div className="relative group/diagram">
                <SchemdrawDiagram code={block.code} />
                <SendToWhiteboardButton
                  onClick={() =>
                    onSendToWhiteboard([
                      { kind: DIAGRAM_TO_KIND[block.diagramType], content: block.code },
                    ])
                  }
                />
              </div>
            </ErrorBoundary>
          );
        }

        return null;
      })}
    </div>
  );
}

/** Floating "Send to whiteboard" button that appears on diagram hover. */
function SendToWhiteboardButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      className="absolute bottom-2 right-2 gap-1.5 opacity-0 group-hover/diagram:opacity-100 transition-opacity text-xs h-7 px-2"
      aria-label="Send to whiteboard"
    >
      <LayoutPanelLeft className="h-3.5 w-3.5" />
      Send to whiteboard
    </Button>
  );
}
