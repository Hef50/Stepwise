import { generateText } from "ai";
import { geminiVisionModel } from "@/lib/ai/gemini";
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

  const imageContent = images.map((dataUrl) => {
    const [header, base64Data] = dataUrl.split(",");
    const mimeTypeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/png";

    return {
      type: "image" as const,
      image: base64Data,
      mimeType,
    };
  });

  const { text } = await generateText({
    model: geminiVisionModel,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: prompt || "Analyze what is shown in this image and describe it clearly for educational context.",
          },
        ],
      },
    ],
    maxOutputTokens: 2048,
  });

  const response: VisionResponse = { analysis: text };
  return Response.json(response);
}
