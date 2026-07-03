import { generateText, type FilePart, type TextPart } from "ai";
import {
  getGoogleVisionModel,
  getOpenRouterClient,
  OPENROUTER_VISION_MODEL,
} from "@/lib/ai/gemini";
import type { VisionRequest, VisionResponse } from "@/lib/types";

const DEFAULT_VISION_PROMPT =
  "Analyze what is shown in this image and describe it clearly for educational context.";

function getDataUrlMediaType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] ?? "image/png";
}

async function analyzeWithGoogle(
  prompt: string | undefined,
  images: string[]
): Promise<string> {
  const content: Array<FilePart | TextPart> = [
    ...images.map((dataUrl, index) => ({
      type: "file" as const,
      data: new URL(dataUrl),
      mediaType: getDataUrlMediaType(dataUrl),
      filename: `visual-context-${index + 1}.png`,
    })),
    {
      type: "text" as const,
      text: prompt ?? DEFAULT_VISION_PROMPT,
    },
  ];

  const result = await generateText({
    model: getGoogleVisionModel(),
    messages: [{ role: "user", content }],
    maxOutputTokens: 2048,
  });

  return result.text;
}

async function analyzeWithOpenRouter(
  prompt: string | undefined,
  images: string[]
): Promise<string> {
  const openrouterClient = getOpenRouterClient();
  const stream = await openrouterClient.chat.send({
    chatRequest: {
      model: OPENROUTER_VISION_MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((dataUrl) => ({
              type: "image_url" as const,
              imageUrl: { url: dataUrl },
            })),
            {
              type: "text" as const,
              text: prompt ?? DEFAULT_VISION_PROMPT,
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

  return analysis;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as VisionRequest;
  const { prompt, images } = body;

  if (!images || images.length === 0) {
    return Response.json(
      { error: "At least one image is required" },
      { status: 400 }
    );
  }

  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const hasGoogleKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY
  );

  if (!hasOpenRouterKey && !hasGoogleKey) {
    return Response.json(
      {
        error:
          "Vision analysis requires OPENROUTER_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.",
      },
      { status: 503 }
    );
  }

  const analysis = hasOpenRouterKey
    ? await analyzeWithOpenRouter(prompt, images)
    : await analyzeWithGoogle(prompt, images);

  if (!analysis) {
    return Response.json(
      { error: "Vision model returned an empty response" },
      { status: 502 }
    );
  }

  return Response.json({ analysis } satisfies VisionResponse);
}
