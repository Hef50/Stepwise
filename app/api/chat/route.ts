import { streamText, convertToModelMessages, APICallError, type UIMessage } from "ai";
import { llm7TextModel } from "@/lib/ai/llm7";
import { openrouterGemma } from "@/lib/ai/openrouter";
import { enrichMessagesWithPdfContext } from "@/lib/chat/pdfAttachments";
import type { ChatProvider } from "@/lib/types";

const SYSTEM_PROMPT = `You are Stepwise, an expert AI tutor. You help students learn by breaking down complex concepts into clear, step-by-step explanations.

DIAGRAM INSTRUCTIONS:
- When explaining a process, algorithm, flowchart, or concept with relationships, output a Mermaid diagram using a fenced code block labeled \`\`\`mermaid.
- When explaining a circuit, electrical schematic, or physics diagram, output a Schemdraw code block labeled \`\`\`schemdraw (Python-style Schemdraw code). The UI will render a visual placeholder.
- Always follow diagrams with a brief written explanation.

TEACHING STYLE:
- Be concise but thorough. Use numbered steps for procedures.
- Use analogies and examples to clarify abstract concepts.
- Ask follow-up questions to check understanding when appropriate.
- Encourage the student when they make progress.`;

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
