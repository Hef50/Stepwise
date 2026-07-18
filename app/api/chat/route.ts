import {
  streamText,
  isStepCount,
  convertToModelMessages,
  APICallError,
  type UIMessage,
  type PrepareStepFunction,
} from "ai";
import { z } from "zod";
import { llm7TextModel } from "@/lib/ai/llm7";
import { openrouterGemma } from "@/lib/ai/openrouter";
import { enrichMessagesWithPdfContext } from "@/lib/chat/pdfAttachments";
import { detectWhiteboardIntent } from "@/lib/chat/whiteboardIntent";
import { createSmokeTestStreamResponse } from "@/lib/dev/smokeTestStream";
import { diagramSpecSchema } from "@/lib/whiteboard/diagramSpec";
import type { ChatProvider } from "@/lib/types";

const BASE_SYSTEM_PROMPT = `You are Stepwise, an expert AI tutor. You help students learn by breaking down complex concepts into clear, step-by-step explanations.

DIAGRAM RENDERING INSTRUCTIONS:
- When a concept map, flowchart, tree, geometric figure, or simple plot would help the student understand, call render_diagram_whiteboard with a structured diagram spec.
- Prefer layout "graph" for concept maps / flowcharts / trees (nodes + edges; the client auto-lays them out). Prefer layout "absolute" for geometry, coordinate plots, or freeform shapes with explicit coordinates.
- Keep diagrams focused — typically 3–12 nodes or a modest set of primitives. Do not dump huge graphs.
- Use diagrams sparingly: one clear diagram beats several cluttered ones. Keep explanatory prose in chat.
- NEVER emit a long single-column chain of 5+ boxes when the topic has branches, inputs/outputs, or parallel ideas. Prefer branching graphs (one node with 2+ outgoing edges) or set direction "LR".
- Keep node labels short (1–4 words). Put detail in chat prose, not inside boxes.
- Always include an edges array that connects the story — every important relationship should be an edge so arrows are drawn.

MATH RENDERING INSTRUCTIONS:
- NEVER write mathematical equations, formulas, or expressions as plain text or inline LaTeX (e.g. do not write "$x^2$" or "\\frac{1}{2}" in your message text).
- Whenever you need to display any equation, formula, or mathematical expression — no matter how simple — you MUST call the render_math_whiteboard tool with the LaTeX string.
- You may write surrounding explanatory prose in your message text, but every equation must go through the tool exclusively.
- Use display mode (displayMode: true) for standalone equations and display mode false for short inline expressions only when context requires it.

WHITEBOARD TEXT INSTRUCTIONS:
- Use render_text_whiteboard SPARINGLY for short handwritten labels, titles, key terms, or brief takeaways on the whiteboard.
- NEVER write full sentences on the whiteboard — max ~6 words (e.g. "Quadratic formula", "Key idea: chain rule", "Step 1").
- Keep all explanatory prose in your chat message. The whiteboard is for scannable labels next to equations, not paragraphs.
- Prefer one short label per major equation or section when it helps the student orient.

TEACHING STYLE:
- Be concise but thorough. Use numbered steps for procedures.
- Use analogies and examples to clarify abstract concepts.
- Ask follow-up questions to check understanding when appropriate.
- Encourage the student when they make progress.`;

/** Extra instruction injected when the user explicitly asks for whiteboard rendering. */
const WHITEBOARD_FORCE_ADDENDUM = `

CRITICAL WHITEBOARD INSTRUCTION:
The user has asked you to show or draw something on the whiteboard. You MUST call render_math_whiteboard, render_text_whiteboard, and/or render_diagram_whiteboard at least once before writing any prose. For every equation, formula, or mathematical expression in your response, call render_math_whiteboard with its LaTeX. Use render_text_whiteboard for short labels/titles only. Use render_diagram_whiteboard for concept maps, flowcharts, geometry, or plots. Do NOT write any equation as plain text.`;

/** System prompt used when the provider does not support tools (e.g. LLM7). */
const NO_TOOLS_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

NOTE: Because this provider does not support tool calls:
- Write every mathematical equation on its own line wrapped in $$ ... $$ (display math). Example: $$E = mc^2$$.
- For short whiteboard labels/titles/key terms (max ~6 words, never full sentences), write [[board: Your label here]] inline. Example: [[board: Quadratic formula]]. Use sparingly.
- For diagrams (concept maps, flowcharts, geometry, plots), write a single-line marker [[diagram: {json}]] where {json} is a valid diagram spec object. Prefer branching graphs over long vertical chains; use short labels (1–4 words) and include every relationship in edges. Example: [[diagram: {"layout":"graph","title":"Photosynthesis","direction":"LR","nodes":[{"id":"light","label":"Light"},{"id":"water","label":"Water"},{"id":"etc","label":"ETC"},{"id":"calvin","label":"Calvin Cycle"},{"id":"sugar","label":"Glucose"}],"edges":[{"from":"light","to":"etc"},{"from":"water","to":"etc"},{"from":"etc","to":"calvin"},{"from":"calvin","to":"sugar"}]}]]. Absolute example: [[diagram: {"layout":"absolute","primitives":[{"type":"circle","cx":80,"cy":80,"r":40},{"type":"label","x":80,"y":80,"text":"Earth"}]}]].
- The UI will render equations, board labels, and diagrams on the whiteboard. Do NOT output Mermaid or other diagram code fences.`;

const mathWhiteboardTool = {
  description:
    "Render a mathematical equation on the whiteboard canvas using LaTeX. " +
    "Use this tool for ALL equations and formulas — never write them as plain text in your message.",
  inputSchema: z.object({
    latex: z
      .string()
      .describe(
        'Valid LaTeX string for the equation, e.g. "\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"'
      ),
    displayMode: z
      .boolean()
      .optional()
      .describe(
        "true for block/display equations (default), false for short inline expressions"
      ),
  }),
} as const;

const textWhiteboardTool = {
  description:
    "Write a short handwritten label, title, or key term on the whiteboard. " +
    "Use SPARINGLY — never full sentences. Max ~6 words. Keep explanatory prose in chat.",
  inputSchema: z.object({
    text: z
      .string()
      .describe(
        'Short label only, e.g. "Quadratic formula" or "Key: chain rule" (max ~6 words)'
      ),
    kind: z
      .enum(["label", "title", "note"])
      .optional()
      .describe("label (default), title, or note — all are short phrases"),
  }),
} as const;

const diagramWhiteboardTool = {
  description:
    "Draw a hand-drawn diagram on the whiteboard stroke-by-stroke. " +
    "Use for concept maps, flowcharts, trees (layout: graph — nodes + edges, auto-laid-out), " +
    "or geometry / plots / freeform shapes (layout: absolute — primitives with coordinates). " +
    "Prefer branching graphs over long single-column chains; keep node labels to 1–4 words; " +
    "include every relationship in edges. Optional direction: TB or LR. " +
    "Keep diagrams focused (typically 3–12 nodes or a modest primitive set).",
  inputSchema: diagramSpecSchema,
} as const;

type WhiteboardTools = {
  render_math_whiteboard: typeof mathWhiteboardTool;
  render_text_whiteboard: typeof textWhiteboardTool;
  render_diagram_whiteboard: typeof diagramWhiteboardTool;
};

interface ChatBody {
  messages: UIMessage[];
  provider?: ChatProvider;
  forceWhiteboard?: boolean;
  /** Dev Mode: force LLM7 path to fail (for error-banner testing). */
  forceLlm7Fail?: boolean;
  /** Dev Mode: stream a canned whiteboard smoke-test response (no LLM). */
  smokeTest?: boolean;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const {
    messages,
    provider = "llm7",
    forceWhiteboard: clientForceFlag = false,
    forceLlm7Fail = false,
    smokeTest = false,
  } = body;

  // Server-side intent re-check so the flag cannot be skipped accidentally
  const lastUserText = [...messages]
    .reverse()
    .find((m) => m.role === "user")
    ?.parts.filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("") ?? "";

  // Dev Mode smoke test (client sends smokeTest when Dev Mode is on and input is "t")
  if (smokeTest) {
    return createSmokeTestStreamResponse();
  }

  // Dev Mode: simulate an LLM7 provider failure for the error-banner UI
  if (forceLlm7Fail && provider !== "gemma") {
    return Response.json({ error: "LLM7_FAILED" }, { status: 500 });
  }

  const forceWhiteboard = clientForceFlag || detectWhiteboardIntent(lastUserText);

  const supportsTools = provider === "gemma";
  const model = provider === "gemma" ? openrouterGemma : llm7TextModel;

  const modelMessages = await convertToModelMessages(
    enrichMessagesWithPdfContext(messages)
  );

  // For providers that support tools
  if (supportsTools) {
    const systemPrompt =
      BASE_SYSTEM_PROMPT + (forceWhiteboard ? WHITEBOARD_FORCE_ADDENDUM : "");

    // prepareStep: force tool call on the first two steps; release on step 3+
    const prepareStep: PrepareStepFunction<WhiteboardTools> = ({
      steps,
      stepNumber,
    }) => {
      const hasToolCall = steps.some(
        (s) => s.toolCalls && s.toolCalls.length > 0
      );
      if (hasToolCall || stepNumber >= 2) {
        return { toolChoice: "auto" as const };
      }
      return {
        toolChoice: {
          type: "tool" as const,
          toolName: "render_math_whiteboard" as const,
        },
      };
    };

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens: 4096,
        tools: {
          render_math_whiteboard: mathWhiteboardTool,
          render_text_whiteboard: textWhiteboardTool,
          render_diagram_whiteboard: diagramWhiteboardTool,
        },
        ...(forceWhiteboard
          ? {
              toolChoice: {
                type: "tool" as const,
                toolName: "render_math_whiteboard" as const,
              },
              stopWhen: isStepCount(4),
              prepareStep,
            }
          : { toolChoice: "auto" as const }),
      });

      return result.toUIMessageStreamResponse({
        onError: (error) => {
          if (APICallError.isInstance(error) && error.statusCode === 429) {
            return "GEMMA_RATE_LIMITED";
          }
          return "GEMMA_FAILED";
        },
      });
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode === 429) {
        return Response.json({ error: "GEMMA_RATE_LIMITED" }, { status: 429 });
      }
      console.error("[chat] Gemma error:", error);
      return Response.json({ error: "GEMMA_FAILED" }, { status: 500 });
    }
  }

  // Provider does not support tools (LLM7) — prose-only path
  try {
    const result = streamText({
      model,
      system: NO_TOOLS_SYSTEM_PROMPT,
      messages: modelMessages,
      maxOutputTokens: 4096,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        if (APICallError.isInstance(error)) {
          if (error.statusCode === 403) return "LLM7_FORBIDDEN";
          if (error.statusCode === 400) return "LLM7_REJECTED";
          if (error.statusCode === 429) return "LLM7_RATE_LIMITED";
        }
        return "LLM7_FAILED";
      },
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 400) {
        console.error("[chat] LLM7 400 error:", error);
        return Response.json({ error: "LLM7_REJECTED" }, { status: 400 });
      }
      if (error.statusCode === 403) {
        console.error("[chat] LLM7 403 error:", error);
        return Response.json({ error: "LLM7_FORBIDDEN" }, { status: 403 });
      }
      if (error.statusCode === 429) {
        return Response.json({ error: "LLM7_RATE_LIMITED" }, { status: 429 });
      }
    }
    console.error("[chat] Unexpected error:", error);
    return Response.json({ error: "LLM7_FAILED" }, { status: 500 });
  }
}
