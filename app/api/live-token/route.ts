import { GoogleGenAI, Modality } from "@google/genai";

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

function getGeminiApiKey(): string | null {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
}

export async function POST(): Promise<Response> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return Response.json(
      {
        error:
          "Gemini Live requires GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in .env.local.",
      },
      { status: 503 }
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });

  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
      liveConnectConstraints: {
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            "You are Stepwise, a warm expert AI teaching assistant in a live office-hours call. Keep answers concise, conversational, and educational. Ask a short follow-up question when it helps the student keep moving.",
        },
      },
      lockAdditionalFields: ["responseModalities"],
    },
  });

  return Response.json({
    token: token.name,
    model: LIVE_MODEL,
  });
}
