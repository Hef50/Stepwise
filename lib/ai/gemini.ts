import { createGoogleGenerativeAI } from "@ai-sdk/google";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

export const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/** Gemini Flash vision model for whiteboard/image analysis */
export const geminiVisionModel = googleAI("gemini-2.0-flash");
