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
import type { ChatProvider } from "@/lib/types";

const BASE_SYSTEM_PROMPT = `You are Stepwise, an expert AI tutor. You help students learn by breaking down complex concepts into clear, step-by-step explanations.

DO NOT produce diagrams of any kind. Never output Mermaid, Schemdraw, or other diagram code blocks. Explain with clear prose and equations only.

MATH RENDERING INSTRUCTIONS:
- NEVER write mathematical equations, formulas, or expressions as plain text or inline LaTeX (e.g. do not write "$x^2$" or "\\frac{1}{2}" in your message text).
- Whenever you need to display any equation, formula, or mathematical expression — no matter how simple — you MUST call the render_math_whiteboard tool with the LaTeX string.
- You may write surrounding explanatory prose in your message text, but every equation must go through the tool exclusively.
- Use display mode (displayMode: true) for standalone equations and display mode false for short inline expressions only when context requires it.

TEACHING STYLE:
- Be concise but thorough. Use numbered steps for procedures.
- Use analogies and examples to clarify abstract concepts.
- Ask follow-up questions to check understanding when appropriate.
- Encourage the student when they make progress.`;

/** Extra instruction injected when the user explicitly asks for whiteboard rendering. */
const WHITEBOARD_FORCE_ADDENDUM = `

CRITICAL WHITEBOARD INSTRUCTION:
The user has asked you to show or draw something on the whiteboard. You MUST call render_math_whiteboard at least once before writing any prose. For every equation, formula, or mathematical expression in your response, call render_math_whiteboard with its LaTeX. Do NOT write any equation as plain text.`;

/** System prompt used when the provider does not support tools (e.g. LLM7). */
const NO_TOOLS_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

NOTE: Because this provider does not support tool calls, write every mathematical equation on its own line wrapped in $$ ... $$ (display math). Example: $$E = mc^2$$. The UI will render these as visual equation cards. Do NOT produce any diagrams.`;

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

interface ChatBody {
  messages: UIMessage[];
  provider?: ChatProvider;
  forceWhiteboard?: boolean;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const { messages, provider = "llm7", forceWhiteboard: clientForceFlag = false } = body;

  // Server-side intent re-check so the flag cannot be skipped accidentally
  const lastUserText = [...messages]
    .reverse()
    .find((m) => m.role === "user")
    ?.parts.filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("") ?? "";

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
    const prepareStep: PrepareStepFunction<
      { render_math_whiteboard: typeof mathWhiteboardTool }
    > = ({ steps, stepNumber }) => {
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
          return String(error);
        },
      });
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode === 429) {
        return Response.json({ error: "GEMMA_RATE_LIMITED" }, { status: 429 });
      }
      console.error("[chat] Gemma error:", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
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
      onError: (error) => String(error),
    });
  } catch (error) {
    // LLM7 sometimes 400s — surface a clean error
    if (APICallError.isInstance(error) && error.statusCode === 400) {
      console.error("[chat] LLM7 400 error:", error);
      return Response.json(
        { error: "LLM7 rejected the request" },
        { status: 400 }
      );
    }
    console.error("[chat] Unexpected error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
