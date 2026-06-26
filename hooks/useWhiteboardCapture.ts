"use client";

import { useCallback, useRef } from "react";
import type { Editor } from "@tldraw/tldraw";
import { captureWhiteboard } from "@/lib/whiteboard/capture";
import type { CanvasPayload } from "@/lib/types";

export interface UseWhiteboardCaptureReturn {
  editorRef: React.MutableRefObject<Editor | null>;
  capture: () => Promise<CanvasPayload | null>;
}

export function useWhiteboardCapture(): UseWhiteboardCaptureReturn {
  const editorRef = useRef<Editor | null>(null);

  const capture = useCallback(async (): Promise<CanvasPayload | null> => {
    if (!editorRef.current) return null;
    try {
      return await captureWhiteboard(editorRef.current);
    } catch (err) {
      console.error("[useWhiteboardCapture] capture failed:", err);
      return null;
    }
  }, []);

  return { editorRef, capture };
}
