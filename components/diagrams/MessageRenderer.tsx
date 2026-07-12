"use client";

import { useMemo } from "react";
import { parseMessageBlocks } from "@/lib/markdown/parseBlocks";
import { segmentTextWithEquations } from "@/lib/chat/extractEquations";

interface MessageRendererProps {
  content: string;
  /** Called when the user clicks "Go to equation" for a given latex string. */
  focusEquation?: (latex: string) => void;
}

// ─── Equation card ────────────────────────────────────────────────────────────

interface EquationCardProps {
  latex: string;
  onGoTo?: () => void;
}

function EquationCard({ latex, onGoTo }: EquationCardProps) {
  return (
    <div className="my-1.5 flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-foreground">
        {latex}
      </code>
      {onGoTo && (
        <button
          type="button"
          onClick={onGoTo}
          className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 active:bg-primary/20"
        >
          Go to equation →
        </button>
      )}
    </div>
  );
}

// ─── Text block with inline equation detection ────────────────────────────────

interface TextBlockProps {
  content: string;
  focusEquation?: (latex: string) => void;
}

function TextBlock({ content, focusEquation }: TextBlockProps) {
  const segments = useMemo(() => segmentTextWithEquations(content), [content]);

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.type === "equation") {
          return (
            <EquationCard
              key={i}
              latex={seg.latex}
              onGoTo={focusEquation ? () => focusEquation(seg.latex) : undefined}
            />
          );
        }
        return (
          <div
            key={i}
            className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap leading-relaxed"
          >
            {seg.content}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function MessageRenderer({ content, focusEquation }: MessageRendererProps) {
  const blocks = useMemo(() => parseMessageBlocks(content), [content]);

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => {
        if (block.kind === "text") {
          return (
            <TextBlock
              key={index}
              content={block.content}
              focusEquation={focusEquation}
            />
          );
        }

        // Diagrams (mermaid/schemdraw) are temporarily disabled — focus is on
        // LaTeX/whiteboard rendering. Skip diagram blocks entirely.
        return null;
      })}
    </div>
  );
}
