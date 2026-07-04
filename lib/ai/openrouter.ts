import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY environment variable is not set.");
}

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": "https://stepwise.app",
    "X-Title": "Stepwise AI Tutor",
  },
});

/** Free multimodal Gemma 4 model via OpenRouter — used when vision is escalated */
export const openrouterGemma = openrouter("google/gemma-4-26b-a4b-it:free");
