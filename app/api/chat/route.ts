import { streamText, convertToModelMessages, APICallError, type UIMessage } from "ai";
import { z } from "zod";
import { llm7TextModel } from "@/lib/ai/llm7";
import { openrouterGemma } from "@/lib/ai/openrouter";
import { enrichMessagesWithPdfContext } from "@/lib/chat/pdfAttachments";
import type { ChatProvider } from "@/lib/types";

const SYSTEM_PROMPT = `You are Stepwise, an expert AI tutor. You help students learn by breaking down complex concepts into clear, step-by-step explanations.

DIAGRAM INSTRUCTIONS:
- When explaining a process, algorithm, flowchart, or concept with relationships, output a Mermaid diagram using a fenced code block labeled \`\`\`mermaid.
- When explaining a circuit, electrical schematic, or physics diagram, output a Schemdraw code block labeled \`\`\`schemdraw (Python-style Schemdraw code). The UI will render a visual placeholder.
- Always follow diagrams with a brief written explanation.

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
  // No execute() — this is a client-side tool handled by onToolCall in the chat UI
} as const;

interface ChatBody {
  messages: UIMessage[];
  provider?: ChatProvider;
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const { messages, provider = "llm7" } = body;

  const model = provider === "gemma" ? openrouterGemma : llm7TextModel;

  try {
    const modelMessages = await convertToModelMessages(
      enrichMessagesWithPdfContext(messages)
    );

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      maxOutputTokens: 4096,
      tools: {
        render_math_whiteboard: mathWhiteboardTool,
      },
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
    console.error("[chat] Unexpected error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
