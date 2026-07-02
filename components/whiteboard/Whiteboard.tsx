"use client";

import { useCallback } from "react";
import { Tldraw, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { customShapeUtils } from "./shapes";

interface WhiteboardProps {
  onEditorReady: (editor: Editor) => void;
}

export default function Whiteboard({ onEditorReady }: WhiteboardProps) {
  const handleMount = useCallback(
    (editor: Editor) => {
      onEditorReady(editor);
    },
    [onEditorReady]
  );

  return (
    <div className="absolute inset-0">
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
      />
    </div>
  );
}
