"use client";

import { useMemo } from "react";
import { parseMessageBlocks } from "@/lib/markdown/parseBlocks";
import { MermaidDiagram } from "./MermaidDiagram";
import { SchemdrawDiagram } from "./SchemdrawDiagram";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

interface MessageRendererProps {
  content: string;
}

export function MessageRenderer({ content }: MessageRendererProps) {
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
              <MermaidDiagram code={block.code} />
            </ErrorBoundary>
          );
        }

        if (block.diagramType === "schemdraw") {
          return (
            <ErrorBoundary key={index} label="Schemdraw Diagram">
              <SchemdrawDiagram code={block.code} />
            </ErrorBoundary>
          );
        }

        return null;
      })}
    </div>
  );
}
