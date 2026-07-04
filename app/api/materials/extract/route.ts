export const runtime = "nodejs";

import { PDFParse } from "pdf-parse";
import type { MaterialExtractRequest, MaterialExtractResponse } from "@/lib/types";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as MaterialExtractRequest;
  const { dataUrl, name } = body;

  if (!dataUrl || !dataUrl.startsWith("data:application/pdf;base64,")) {
    return Response.json({ error: "A PDF data URL is required" }, { status: 400 });
  }

  const base64 = dataUrl.slice("data:application/pdf;base64,".length);
  const buffer = Buffer.from(base64, "base64");

  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return Response.json(
      { error: "PDF exceeds maximum size of 20 MB" },
      { status: 413 }
    );
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let textResult: Awaited<ReturnType<typeof parser.getText>>;
  try {
    textResult = await parser.getText();
  } catch {
    return Response.json({ error: "Failed to parse PDF" }, { status: 422 });
  } finally {
    await parser.destroy();
  }

  // Collapse excessive whitespace while preserving paragraph breaks
  const text = textResult.text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return Response.json({
    text,
    pageCount: textResult.pages.length,
    name,
  } satisfies MaterialExtractResponse);
}
