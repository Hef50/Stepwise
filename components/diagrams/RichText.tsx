"use client";

import { useMemo } from "react";
import katex from "katex";

interface RichTextProps {
  content: string;
}

type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

// Matches $$…$$, \[…\] (display) and $…$, \(…\) (inline).
// Order matters: display delimiters are checked before inline ones.
const MATH_PATTERN =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

function splitSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MATH_PATTERN.lastIndex = 0;
  while ((match = MATH_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    const displayBlock = match[1] ?? match[2];
    const inline = match[3] ?? match[4];
    const value = (displayBlock ?? inline ?? "").trim();

    if (value) {
      segments.push({ type: "math", value, display: displayBlock != null });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

function renderMath(expr: string, display: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode: display,
      throwOnError: false,
      output: "html",
    });
  } catch {
    return expr;
  }
}

/**
 * Renders a chat text block with embedded LaTeX. Math delimited by $$…$$ or
 * \[…\] renders as centred display math; $…$ or \(…\) renders inline.
 */
export function RichText({ content }: RichTextProps) {
  const segments = useMemo(() => splitSegments(content), [content]);

  return (
    <div className="whitespace-pre-wrap leading-relaxed break-words">
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        return (
          <span
            key={i}
            className={seg.display ? "block my-2 text-center" : "inline"}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.value, seg.display) }}
          />
        );
      })}
    </div>
  );
}
