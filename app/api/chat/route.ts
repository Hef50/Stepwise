import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { getLlm7TextModel } from "@/lib/ai/llm7";
import { isRateLimitError, rateLimitResponse, RATE_LIMIT_MESSAGE } from "@/lib/rateLimit";

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

function withVisualContext(messages: UIMessage[], visualContext?: string): UIMessage[] {
  const context = visualContext?.trim();
  if (!context) return messages;

  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex === -1) return messages;

  return messages.map((message, index) => {
    if (index !== lastUserIndex) return message;

    return {
      ...message,
      parts: [
        ...message.parts,
        {
          type: "text" as const,
          text: `\n\n[Visual context from the student's current whiteboard and attachments]\n${context}`,
        },
      ],
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages: UIMessage[];
      visualContext?: string;
    };
    const { messages, visualContext } = body;
    const modelMessages = withVisualContext(messages, visualContext);

    const hasModelKey = Boolean(process.env.LLM7_API_KEY);

    if (!hasModelKey) {
      const promptText = getLastUserText(modelMessages);
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
      messages: await convertToModelMessages(modelMessages),
      maxOutputTokens: 4096,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => (isRateLimitError(error) ? RATE_LIMIT_MESSAGE : "An error occurred."),
    });
  } catch (err) {
    if (isRateLimitError(err)) {
      return rateLimitResponse("Chat model rate limit reached. Please retry later.");
    }

    throw err;
  }
}
