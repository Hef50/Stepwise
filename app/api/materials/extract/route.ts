import type { PdfExtractResponse } from "@/lib/types";

// Force Node.js runtime — pdfjs requires Node APIs, incompatible with Edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const name = file instanceof File ? file.name : "document.pdf";

  if (!name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are accepted" }, { status: 415 });
  }

  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File exceeds 20 MB limit" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();

  // unpdf: zero-dependency PDF text extractor for Node / edge environments.
  const { extractText } = await import("unpdf");

  let text = "";
  let pageCount = 0;
  try {
    const result = await extractText(new Uint8Array(arrayBuffer), {
      mergePages: true,
    });
    // extractText returns { text: string, totalPages: number }
    text = (result.text as unknown as string[] | string[]).join
      ? (result.text as unknown as string[]).join("\n")
      : (result.text as unknown as string);
    pageCount = result.totalPages;
  } catch (err) {
    console.error("[materials/extract] unpdf failed:", err);
    return Response.json({ error: "Failed to parse PDF" }, { status: 422 });
  }

  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const response: PdfExtractResponse = {
    name,
    text: cleaned,
    pageCount,
  };

  return Response.json(response);
}
