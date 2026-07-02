import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { getLlm7TextModel } from "@/lib/ai/llm7";

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

function getLastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) return "";

  return lastUser.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export async function POST(request: Request) {
  const body = (await request.json()) as { messages: UIMessage[] };
  const { messages } = body;

  const hasModelKey = Boolean(process.env.LLM7_API_KEY);

  if (!hasModelKey) {
    const promptText = getLastUserText(messages);
    const fallbackText = promptText
      ? `I’m running in local demo mode because no AI API key is configured. Here’s a helpful tutor-style response to your question: ${promptText}. I can break the concept down step by step once a model key is connected.`
      : "I’m running in local demo mode because no AI API key is configured. Add an API key to enable richer tutor responses.";

    const stream = createUIMessageStream({
      execute({ writer }) {
        writer.write({ type: "text-start", id: "fallback-response" });
        writer.write({ type: "text-delta", id: "fallback-response", delta: fallbackText });
        writer.write({ type: "text-end", id: "fallback-response" });
      },
      originalMessages: messages,
    });

    return createUIMessageStreamResponse({ stream });
  }

  const result = streamText({
    model: getLlm7TextModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
