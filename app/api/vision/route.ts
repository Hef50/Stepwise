import { openrouterClient, VISION_MODEL } from "@/lib/ai/gemini";
import type { VisionRequest, VisionResponse, VisionTask } from "@/lib/types";

const SYSTEM_PROMPTS: Record<VisionTask, string> = {
  describe:
    "You are an expert AI tutor. Analyze the whiteboard image the student has shared and describe its content clearly and concisely. Identify any diagrams, equations, text, or drawings and explain what they represent in an educational context.",
  check_work:
    "You are an expert AI tutor grading a student's work shown on the whiteboard. Review the solution carefully. Point out any errors or misconceptions, explain the correct approach step by step, and encourage the student. Be specific about what is right and what needs improvement.",
};

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

  // Build the user text: prefer explicit prompt, then context augmentation.
  let userText =
    prompt ??
    (task === "check_work"
      ? "Please check my work shown on the whiteboard."
      : "Please describe what is on the whiteboard.");

  if (context && task === "check_work") {
    userText = `Problem / context:\n${context}\n\nStudent's work is shown in the image. ${userText}`;
  }

  const stream = await openrouterClient.chat.send({
    chatRequest: {
      model: VISION_MODEL,
      stream: true,
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            ...images.map((dataUrl) => ({
              type: "image_url" as const,
              imageUrl: { url: dataUrl },
            })),
            {
              type: "text" as const,
              text: userText,
            },
          ],
        },
      ],
      maxCompletionTokens: 2048,
    },
    httpReferer: "https://stepwise.app",
    appTitle: "Stepwise AI Tutor",
  });

  let analysis = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta.content;
    if (content) analysis += content;
  }

  if (!analysis) {
    return Response.json(
      { error: "Vision model returned an empty response" },
      { status: 502 }
    );
  }

  return Response.json({ analysis, task } satisfies VisionResponse);
}
