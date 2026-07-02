"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tldraw/tldraw";
import { MessageSquare, PenTool } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";
import { WhiteboardActionBar } from "@/components/whiteboard/WhiteboardActionBar";
import { Skeleton } from "@/components/ui/skeleton";
import { useWhiteboardCapture } from "@/hooks/useWhiteboardCapture";

// ChatPanel reads from localStorage and uses browser-only APIs (Web Speech).
// Rendering it on the server would always produce a different DOM than the
// client, causing hydration mismatches. ssr:false renders it only in the browser.
const ChatPanel = dynamic(
  () => import("@/components/chat/ChatPanel").then((m) => m.ChatPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex-1" />
        <Skeleton className="h-12 w-full" />
      </div>
    ),
  }
);

const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 720;
const DEFAULT_CHAT_WIDTH = 420;

export function AppShell() {
  const { editorRef, capture } = useWhiteboardCapture();
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);

  // Refs that ChatPanel populates once mounted, so the whiteboard action bar
  // can trigger chat-side handlers without crossing the dynamic-import boundary.
  const describeRef = useRef<(() => void) | null>(null);
  const checkWorkRef = useRef<(() => void) | null>(null);

  // Refs so drag handlers never re-bind to stale closures
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
    },
    [editorRef]
  );

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = chatWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [chatWidth]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.min(
        Math.max(startWidthRef.current + delta, MIN_CHAT_WIDTH),
        MAX_CHAT_WIDTH
      );
      setChatWidth(next);
    };

    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <>
      {/* ── Large screens: resizable side-by-side split ── */}
      <div className="hidden lg:flex h-screen w-full overflow-hidden">
        {/* Chat panel — draggable width */}
        <div
          className="flex flex-shrink-0 flex-col border-r border-border bg-background overflow-hidden"
          style={{ width: chatWidth }}
        >
          <ChatPanel
            captureWhiteboard={capture}
            editorRef={editorRef}
            describeRef={describeRef}
            checkWorkRef={checkWorkRef}
          />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="group relative w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary transition-colors"
          title="Drag to resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="h-1 w-1 rounded-full bg-primary/60" />
            <span className="h-1 w-1 rounded-full bg-primary/60" />
            <span className="h-1 w-1 rounded-full bg-primary/60" />
            <span className="h-1 w-1 rounded-full bg-primary/60" />
            <span className="h-1 w-1 rounded-full bg-primary/60" />
          </div>
        </div>

        {/* Whiteboard — fills remaining space */}
        <div className="relative flex-1 overflow-hidden">
          <WhiteboardPanel onEditorReady={handleEditorReady} />
          <WhiteboardActionBar
            onDescribeWhiteboard={() => describeRef.current?.()}
            onCheckWork={() => checkWorkRef.current?.()}
          />
        </div>
      </div>

      {/* ── Small/portrait screens: tabbed stack ── */}
      <div className="flex lg:hidden h-screen w-full flex-col overflow-hidden bg-background">
        <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-border px-3 py-2">
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1 gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="board" className="flex-1 gap-2">
                <PenTool className="h-4 w-4" />
                Whiteboard
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="chat"
            className="flex-1 overflow-hidden mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <ChatPanel
              captureWhiteboard={capture}
              editorRef={editorRef}
              describeRef={describeRef}
              checkWorkRef={checkWorkRef}
            />
          </TabsContent>

          <TabsContent
            value="board"
            className="relative flex-1 overflow-hidden mt-0"
          >
            <WhiteboardPanel onEditorReady={handleEditorReady} />
            <WhiteboardActionBar
              onDescribeWhiteboard={() => describeRef.current?.()}
              onCheckWork={() => checkWorkRef.current?.()}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
