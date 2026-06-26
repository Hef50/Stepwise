"use client";

import { useState, useCallback } from "react";
import type { Editor } from "@tldraw/tldraw";
import { MessageSquare, PenTool } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useWhiteboardCapture } from "@/hooks/useWhiteboardCapture";

export function AppShell() {
  const { editorRef, capture } = useWhiteboardCapture();

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
    },
    [editorRef]
  );

  return (
    <>
      {/* ── Large screens: side-by-side split ── */}
      <div className="hidden lg:flex h-screen w-full overflow-hidden">
        {/* Chat panel — fixed width left column */}
        <div className="flex w-[420px] min-w-[360px] flex-shrink-0 flex-col border-r border-border bg-background">
          <ChatPanel captureWhiteboard={capture} />
        </div>

        {/* Resizer hint */}
        <div className="w-0.5 bg-border flex-shrink-0" />

        {/* Whiteboard — fills remaining space */}
        <div className="relative flex-1 overflow-hidden">
          <WhiteboardPanel onEditorReady={handleEditorReady} />
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
            <ChatPanel captureWhiteboard={capture} />
          </TabsContent>

          <TabsContent
            value="board"
            className="relative flex-1 overflow-hidden mt-0"
          >
            <WhiteboardPanel onEditorReady={handleEditorReady} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
