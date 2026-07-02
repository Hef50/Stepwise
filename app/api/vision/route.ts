import { getOpenRouterClient, VISION_MODEL } from "@/lib/ai/gemini";
import type { VisionRequest, VisionResponse } from "@/lib/types";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as VisionRequest;
  const { prompt, images } = body;

  if (!images || images.length === 0) {
    return Response.json(
      { error: "At least one image is required" },
      { status: 400 }
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      {
        analysis:
          "Vision analysis is unavailable right now because no OpenRouter API key is configured. Add an API key to enable image understanding.",
      } satisfies VisionResponse,
      { status: 200 }
    );
  }

  const openrouterClient = getOpenRouterClient();
  const stream = await openrouterClient.chat.send({
    chatRequest: {
      model: VISION_MODEL,
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
              text:
                prompt ??
                "Analyze what is shown in this image and describe it clearly for educational context.",
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

  return Response.json({ analysis } satisfies VisionResponse);
}
