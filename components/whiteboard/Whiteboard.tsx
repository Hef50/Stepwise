"use client";

import { useCallback } from "react";
import { Tldraw, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { LatexAnimatedShapeUtil } from "./shapes/LatexAnimatedShapeUtil";
import { TextAnimatedShapeUtil } from "./shapes/TextAnimatedShapeUtil";
import { DiagramAnimatedShapeUtil } from "./shapes/DiagramAnimatedShapeUtil";
import { WHITEBOARD_PERSISTENCE_KEY } from "@/hooks/useWhiteboardMath";

const CUSTOM_SHAPE_UTILS = [
  LatexAnimatedShapeUtil,
  TextAnimatedShapeUtil,
  DiagramAnimatedShapeUtil,
] as const;

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
        persistenceKey={WHITEBOARD_PERSISTENCE_KEY}
        shapeUtils={CUSTOM_SHAPE_UTILS}
        onMount={handleMount}
      />
    </div>
  );
}
