import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Create the provider only for a request that actually needs vision. */
export function getOpenrouterGemma() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY environment variable is not set.");
  const openrouter = createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": "https://stepwise.app",
      "X-Title": "Stepwise AI Tutor",
    },
  });
  return openrouter("google/gemma-4-26b-a4b-it:free");
}
