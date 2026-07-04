import type { MaterialExtractResponse } from "@/lib/types";

export async function extractPdfText(
  dataUrl: string,
  name: string
): Promise<MaterialExtractResponse | null> {
  try {
    const res = await fetch("/api/materials/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, name }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MaterialExtractResponse;
  } catch {
    return null;
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
