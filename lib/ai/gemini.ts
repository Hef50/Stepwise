import { OpenRouter } from "@openrouter/sdk";
import { createGoogle } from "@ai-sdk/google";

/** Free multimodal Gemma 4 model for vision analysis via OpenRouter */
export const OPENROUTER_VISION_MODEL = "google/gemma-4-26b-a4b-it:free";
export const GOOGLE_VISION_MODEL = "gemini-2.5-flash";

export function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set.");
  }

  return new OpenRouter({ apiKey });
}

export function getGoogleVisionModel() {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set."
    );
  }

  const google = createGoogle({ apiKey });
  return google(GOOGLE_VISION_MODEL);
}
