import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_TOKEN_TTL_SECONDS } from "@/lib/ai/gemini";
import { isRateLimitError, rateLimitResponse } from "@/lib/rateLimit";

const LIVE_SYSTEM_INSTRUCTION = `You are Stepwise, an expert AI tutor running a live voice office-hours session — exactly like a teaching assistant on Zoom. You can see the student's whiteboard in real time.

STYLE:
- Speak naturally and conversationally, as a friendly TA would.
- Be concise in voice responses — do not read out long formatted lists.
- Refer to what you see on the whiteboard proactively when relevant.
- Ask follow-up questions to check understanding and encourage the student.
- Explain step by step, using analogies for abstract concepts.

WHITEBOARD:
- You receive periodic snapshots of the student's whiteboard as image frames.
- Reference what is drawn when relevant ("I can see you've drawn…").

WHITEBOARD TOOLS:
- You have tools that draw equations, short labels, and diagrams on the shared whiteboard.
- If the student explicitly says "draw on the whiteboard", "write on the whiteboard", "put this on the board", or equivalent wording, you MUST call the appropriate tool before or while answering. Do not merely describe what you would draw.
- Independently decide to draw when a formula or focused diagram would materially improve learning.
- Use LaTeX for equations, short labels only, and compact diagrams. Never claim a tool completed if it failed.`;

export interface LiveTokenResponse {
  token: string;
  expiresAt: string;
}

export async function POST(): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Gemini Live requires GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY." },
      { status: 503 }
    );
  }

  const genai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });
  const expireTime = new Date(Date.now() + GEMINI_LIVE_TOKEN_TTL_SECONDS * 1000);

  try {
    const authToken = await genai.authTokens.create({
      config: {
        uses: 1,
        expireTime: expireTime.toISOString(),
        liveConnectConstraints: {
          model: GEMINI_LIVE_MODEL,
          config: {
            systemInstruction: LIVE_SYSTEM_INSTRUCTION,
            responseModalities: [Modality.AUDIO],
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        },
        // Tools are intentionally not locked so the browser can register the
        // three safe whiteboard functions with its ephemeral Live session.
        lockAdditionalFields: ["responseModalities"],
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    const response: LiveTokenResponse = {
      token: authToken.name ?? "",
      expiresAt: expireTime.toISOString(),
    };

    return Response.json(response);
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitResponse("Gemini Live is rate limited. Please retry shortly.");
    return Response.json(
      { error: error instanceof Error ? `Gemini Live token creation failed: ${error.message}` : "Gemini Live token creation failed." },
      { status: 500 }
    );
  }
}
