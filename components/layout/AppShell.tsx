"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tldraw/tldraw";
import { MessageSquare, PenTool, Mic } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useWhiteboardCapture } from "@/hooks/useWhiteboardCapture";
import { useWhiteboardMath } from "@/hooks/useWhiteboardMath";
import { ModelStatusBadge } from "./ModelStatusBadge";
import { DevModeControls } from "./DevModeControls";
import type { AppMode, ActiveModel } from "@/lib/types";

// ChatPanel uses localStorage + browser-only APIs; ssr:false prevents hydration mismatches
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

const LiveTutorPanel = dynamic(
  () => import("@/components/chat/LiveTutorPanel").then((m) => m.LiveTutorPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full" />
        <div className="flex-1" />
        <Skeleton className="h-12 w-full" />
      </div>
    ),
  }
);

const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 720;
const DEFAULT_CHAT_WIDTH = 420;
const MODE_STORAGE_KEY = "stepwise_mode";

export function AppShell() {
  const { editorRef, capture } = useWhiteboardCapture();
  const {
    renderLatex,
    renderText,
    focusLatexShape,
    latexFontSize,
    setLatexFontSize,
    wbTextSize,
    setWbTextSize,
    wbTextColor,
    setWbTextColor,
    wbTextMode,
    setWbTextMode,
    clearWhiteboard,
  } = useWhiteboardMath(editorRef);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [mode, setMode] = useState<AppMode>("text");
  const [activeModel, setActiveModel] = useState<ActiveModel>("llm7");
  /** Session-only Dev Mode extras (error injection, smoke test, typing hold). */
  const [devMode, setDevMode] = useState(false);
  const [forceLlm7Fail, setForceLlm7Fail] = useState(false);
  const [typingHoldMs, setTypingHoldMs] = useState(0);
  /** Only one Tldraw instance may mount — both share the same persistenceKey. */
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLargeScreen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Restore persisted mode after hydration (client-only, avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY) as AppMode | null;
      if (stored === "text" || stored === "voice") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(stored);
      }
    } catch {
      // localStorage unavailable — use default
    }
  }, []);

  // Persist mode on change
  const handleModeChange = useCallback((next: AppMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    // Voice mode always shows Gemini Live as the active model
    if (next === "voice") {
      setActiveModel("gemini-live");
    } else {
      setActiveModel("llm7");
    }
  }, []);

  // Refs so drag handlers never re-bind to stale closures
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setEditorReady(true);
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

  const chatPanelContent =
    mode === "voice" ? (
      <LiveTutorPanel captureWhiteboard={capture} />
    ) : (
      <ChatPanel
        captureWhiteboard={capture}
        renderLatexOnCanvas={renderLatex}
        renderTextOnCanvas={renderText}
        focusLatexShape={focusLatexShape}
        latexFontSize={latexFontSize}
        onLatexFontSizeChange={setLatexFontSize}
        wbTextSize={wbTextSize}
        onWbTextSizeChange={setWbTextSize}
        wbTextColor={wbTextColor}
        onWbTextColorChange={setWbTextColor}
        wbTextMode={wbTextMode}
        onWbTextModeChange={setWbTextMode}
        onClearWhiteboard={clearWhiteboard}
        editorReady={editorReady}
        onActiveModelChange={setActiveModel}
        devMode={devMode}
        forceLlm7Fail={forceLlm7Fail}
        typingHoldMs={devMode ? typingHoldMs : 0}
      />
    );

  const modeToggle = (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
      <button
        type="button"
        onClick={() => handleModeChange("text")}
        className={`flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "text"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-pressed={mode === "text"}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Text
      </button>
      <button
        type="button"
        onClick={() => handleModeChange("voice")}
        className={`flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "voice"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-pressed={mode === "voice"}
      >
        <Mic className="h-3.5 w-3.5" />
        Live
      </button>
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      <DevModeControls
        devMode={devMode}
        onDevModeChange={setDevMode}
        forceLlm7Fail={forceLlm7Fail}
        onForceLlm7FailChange={setForceLlm7Fail}
        typingHoldMs={typingHoldMs}
        onTypingHoldMsChange={setTypingHoldMs}
      />
      <ModelStatusBadge model={activeModel} />
    </div>
  );

  return (
    <>
      {/* ── Large screens: resizable side-by-side split ── */}
      <div className="hidden lg:flex h-screen w-full flex-col overflow-hidden">
        {/* Top bar with mode toggle + model badge */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
          {modeToggle}
          {headerRight}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Chat/Live panel — draggable width */}
          <div
            className="flex flex-shrink-0 flex-col border-r border-border bg-background overflow-hidden"
            style={{ width: chatWidth }}
          >
            {chatPanelContent}
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
            {isLargeScreen && (
              <WhiteboardPanel onEditorReady={handleEditorReady} />
            )}
          </div>
        </div>
      </div>

      {/* ── Small/portrait screens: tabbed stack ── */}
      <div className="flex lg:hidden h-screen w-full flex-col overflow-hidden bg-background">
        {/* Top bar */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-2">
          {modeToggle}
          {headerRight}
        </div>

        <Tabs defaultValue="chat" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-border px-3 py-2">
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1 gap-2">
                {mode === "voice" ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                {mode === "voice" ? "Live" : "Chat"}
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
            {chatPanelContent}
          </TabsContent>

          <TabsContent
            value="board"
            className="relative flex-1 overflow-hidden mt-0"
          >
            {!isLargeScreen && (
              <WhiteboardPanel onEditorReady={handleEditorReady} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
