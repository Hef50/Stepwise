import { createGoogleGenerativeAI } from "@ai-sdk/google";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

/** Google Gemini provider used for multimodal (vision) analysis. */
export const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Ordered list of Gemini vision models used for whiteboard analysis. The vision
 * route tries them in order, falling through on failure/quota so a single
 * throttled model doesn't break the feature.
 */
export const VISION_MODELS = [
  "gemini-2.5-flash",
] as const;

/** Primary vision model (first in the fallback chain). */
export const VISION_MODEL = VISION_MODELS[0];
