import { GoogleGenAI, Modality } from "@google/genai";
import { stripMarkdownForSpeech } from "@/lib/speech";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const TTS_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

function getPcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function pcm16ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString("base64");
}

function getGeminiApiKey(): string | null {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return Response.json(
      {
        error:
          "Text-to-speech requires GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in .env.local.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = stripMarkdownForSpeech(body?.text ?? "").slice(0, 4000);

  if (!text) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1beta" },
    });

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: TTS_VOICE },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data
    );
    const audioData = audioPart?.inlineData?.data;
    const mimeType = audioPart?.inlineData?.mimeType ?? "audio/wav";

    if (!audioData) {
      return Response.json(
        { error: "TTS model did not return audio." },
        { status: 502 }
      );
    }

    const isRawPcm = mimeType.toLowerCase().startsWith("audio/l16");
    const playableAudioData = isRawPcm
      ? pcm16ToWavBase64(audioData, getPcmSampleRate(mimeType))
      : audioData;

    return Response.json({
      audioData: playableAudioData,
      mimeType: isRawPcm ? "audio/wav" : mimeType,
      sourceMimeType: mimeType,
      model: TTS_MODEL,
      voice: TTS_VOICE,
    });
  } catch (err) {
    console.error("[tts] Gemini TTS error:", err);
    const errorMessage = err instanceof Error ? err.message : "Gemini TTS failed.";
    const status = /quota|429|rate limit/i.test(errorMessage) ? 429 : 500;

    return Response.json(
      {
        error: `Gemini TTS failed: ${errorMessage}`,
      },
      { status }
    );
  }
}
