import { generateText } from "ai";
import { google, VISION_MODELS } from "@/lib/ai/gemini";
import type { VisionRequest, VisionResponse, VisionTask } from "@/lib/types";

const SYSTEM_PROMPTS: Record<VisionTask, string> = {
  describe:
    "You are an expert AI tutor. Analyze the whiteboard image the student has shared and describe its content clearly and concisely. Identify any diagrams, equations, text, or drawings and explain what they represent in an educational context.",
  check_work:
    "You are an expert AI tutor grading a student's work shown on the whiteboard. Review the solution carefully. Point out any errors or misconceptions, explain the correct approach step by step, and encourage the student. Be specific about what is right and what needs improvement.",
};

/** Runs a single vision request against one Gemini model. */
async function runVision(
  model: string,
  systemPrompt: string,
  userText: string,
  images: string[]
): Promise<string> {
  const { text } = await generateText({
    model: google(model),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...images.map((dataUrl) => ({
            type: "image" as const,
            image: dataUrl,
          })),
        ],
      },
    ],
    maxOutputTokens: 2048,
  });
  return text;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as VisionRequest;
  const { prompt, images, task = "describe", context } = body;

  if (!images || images.length === 0) {
    return Response.json(
      { error: "At least one image is required" },
      { status: 400 }
    );
  }

  const systemPrompt = SYSTEM_PROMPTS[task];

  let userText =
    prompt ??
    (task === "check_work"
      ? "Please check my work shown on the whiteboard."
      : "Please describe what is on the whiteboard.");

  if (context && task === "check_work") {
    userText = `Problem / context:\n${context}\n\nStudent's work is shown in the image. ${userText}`;
  }

  // Try each Gemini model in the fallback chain.
  let lastError: unknown = null;

  for (const model of VISION_MODELS) {
    try {
      const analysis = await runVision(model, systemPrompt, userText, images);
      if (analysis) {
        return Response.json({ analysis, task } satisfies VisionResponse);
      }
    } catch (err) {
      lastError = err;
      console.error(`[vision] model ${model} failed:`, err);
    }
  }

  return Response.json(
    { error: "Vision analysis failed. Please try again in a moment." },
    { status: 502 }
  );
}
