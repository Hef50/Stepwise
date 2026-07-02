import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getLlm7TextModel() {
  const apiKey = process.env.LLM7_API_KEY;

  if (!apiKey) {
    throw new Error("LLM7_API_KEY environment variable is not set.");
  }

  const llm7 = createOpenAICompatible({
    name: "llm7",
    baseURL: "https://api.llm7.io/v1",
    apiKey,
  });

  return llm7("fast");
}
