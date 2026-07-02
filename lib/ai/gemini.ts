import { OpenRouter } from "@openrouter/sdk";

/** Free multimodal Gemma 4 model for vision analysis via OpenRouter */
export const VISION_MODEL = "google/gemma-4-26b-a4b-it:free";

export function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set.");
  }

  return new OpenRouter({ apiKey });
}
