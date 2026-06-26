import type { Editor } from "@tldraw/tldraw";
import type { CanvasPayload } from "@/lib/types";

/**
 * Exports the current tldraw canvas to both SVG string and PNG data URL.
 * Returns a typed CanvasPayload suitable for sending to the Vision API route.
 */
export async function captureWhiteboard(editor: Editor): Promise<CanvasPayload> {
  const shapeIds = editor.getCurrentPageShapeIds();

  let svgString = "";
  let imageDataUrl = "";

  if (shapeIds.size > 0) {
    const shapeIdArray = Array.from(shapeIds);

    // Export to SVG string
    const svgResult = await editor.getSvgString(shapeIdArray, {
      scale: 1,
    });
    svgString = svgResult?.svg ?? "";

    // Export to PNG blob -> data URL (format defaults to 'png')
    const imageResult = await editor.toImage(shapeIdArray, {
      format: "png",
      scale: 1,
    });

    if (imageResult?.blob) {
      imageDataUrl = await blobToDataUrl(imageResult.blob);
    }
  }

  return {
    svgString,
    imageDataUrl,
    capturedAt: new Date().toISOString(),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
