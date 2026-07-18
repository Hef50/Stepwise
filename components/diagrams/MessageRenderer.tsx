"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseMessageBlocks } from "@/lib/markdown/parseBlocks";
import {
  segmentTextWithEquations,
  stripIncompleteMathDelimiters,
} from "@/lib/chat/extractEquations";
import { sanitizeBoardTextForDisplay } from "@/lib/chat/extractBoardText";
import { sanitizeDiagramForDisplay } from "@/lib/chat/extractDiagrams";

interface MessageRendererProps {
  content: string;
  /** Called when the user clicks "Go to equation" for a given latex string. */
  focusEquation?: (latex: string) => void;
  /**
   * When set (live streaming), equation cards only appear for latex that has
   * finished drawing. When omitted, all worthy equations show as cards.
   */
  readyEquations?: ReadonlySet<string>;
  /** Pair with readyEquations during live reveal to hide undrawn math. */
  hideUntilReady?: boolean;
}

// ─── Markdown element styles (chat bubble) ────────────────────────────────────

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold leading-snug first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-sm font-semibold leading-snug first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-sm font-semibold leading-snug first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-2 text-sm font-semibold leading-snug first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-2 text-sm font-medium leading-snug first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-2 text-sm font-medium leading-snug first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border/80 pl-3 italic opacity-90 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border/60" />,
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-muted/80 p-3 font-mono text-xs leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2 py-1.5 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-border/60 px-2 py-1.5">{children}</td>
  ),
  del: ({ children }) => <del className="opacity-70 line-through">{children}</del>,
};

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
  readyEquations?: ReadonlySet<string>;
  hideUntilReady?: boolean;
}

function TextBlock({
  content,
  focusEquation,
  readyEquations,
  hideUntilReady,
}: TextBlockProps) {
  const segments = useMemo(() => {
    const cleaned = sanitizeDiagramForDisplay(
      sanitizeBoardTextForDisplay(stripIncompleteMathDelimiters(content))
    );
    return segmentTextWithEquations(cleaned, {
      readyEquations,
      hideUntilReady,
    });
  }, [content, readyEquations, hideUntilReady]);

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.type === "equation") {
          return (
            <EquationCard
              key={i}
              latex={seg.latex}
              onGoTo={
                focusEquation ? () => focusEquation(seg.latex) : undefined
              }
            />
          );
        }
        return (
          <div key={i} className="min-w-0 break-words leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {seg.content}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function MessageRenderer({
  content,
  focusEquation,
  readyEquations,
  hideUntilReady,
}: MessageRendererProps) {
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
              readyEquations={readyEquations}
              hideUntilReady={hideUntilReady}
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
