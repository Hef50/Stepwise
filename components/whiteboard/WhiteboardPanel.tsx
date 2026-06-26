"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import type { Editor } from "@tldraw/tldraw";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

const Whiteboard = dynamic(() => import("./Whiteboard"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  ),
});

interface WhiteboardPanelProps {
  onEditorReady: (editor: Editor) => void;
}

export function WhiteboardPanel({ onEditorReady }: WhiteboardPanelProps) {
  const handleEditorReady = useCallback(
    (editor: Editor) => {
      onEditorReady(editor);
    },
    [onEditorReady]
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <ErrorBoundary label="Whiteboard Canvas">
        <Whiteboard onEditorReady={handleEditorReady} />
      </ErrorBoundary>
    </div>
  );
}
