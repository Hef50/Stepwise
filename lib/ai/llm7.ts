import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

if (!process.env.LLM7_API_KEY) {
  throw new Error("LLM7_API_KEY environment variable is not set.");
}

export const llm7 = createOpenAICompatible({
  name: "llm7",
  baseURL: "https://api.llm7.io/v1",
  apiKey: process.env.LLM7_API_KEY,
});

/** Default model for general tutoring conversations */
export const llm7TextModel = llm7("deepseek-v3-0324");
