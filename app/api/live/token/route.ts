import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_TOKEN_TTL_SECONDS } from "@/lib/ai/gemini";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: "v1alpha" },
});

const LIVE_SYSTEM_INSTRUCTION = `You are Stepwise, an expert AI tutor running a live voice office-hours session — exactly like a teaching assistant on Zoom. You can see the student's whiteboard in real time.

STYLE:
- Speak naturally and conversationally, as a friendly TA would.
- Be concise in voice responses — do not read out long formatted lists.
- Refer to what you see on the whiteboard proactively when relevant.
- Ask follow-up questions to check understanding and encourage the student.
- Explain step by step, using analogies for abstract concepts.

WHITEBOARD:
- You receive periodic snapshots of the student's whiteboard as image frames.
- Reference what is drawn when relevant ("I can see you've drawn…").`;

export interface LiveTokenResponse {
  token: string;
  expiresAt: string;
}

export async function POST(): Promise<Response> {
  const expireTime = new Date(Date.now() + GEMINI_LIVE_TOKEN_TTL_SECONDS * 1000);

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
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  const response: LiveTokenResponse = {
    token: authToken.name ?? "",
    expiresAt: expireTime.toISOString(),
  };

  return Response.json(response);
}
