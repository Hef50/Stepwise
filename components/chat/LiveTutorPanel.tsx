"use client";

import { useEffect, useRef } from "react";
import { Camera, Mic, MicOff, PhoneCall, PhoneOff, Radio, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { cn } from "@/lib/utils";
import type { CanvasPayload } from "@/lib/types";
import type { DiagramSpec } from "@/lib/whiteboard/diagramSpec";

interface LiveTutorPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  renderTextOnCanvas?: (text: string) => Promise<string | null>;
  renderDiagramOnCanvas?: (spec: DiagramSpec | string) => Promise<string | null>;
}

function LiveTutorPanelInner({ captureWhiteboard, renderLatexOnCanvas, renderTextOnCanvas, renderDiagramOnCanvas }: LiveTutorPanelProps) {
  const { status, muted, transcript, error, connect, disconnect, toggleMute, refreshWhiteboard } = useGeminiLive({
    captureWhiteboard,
    renderLatexOnCanvas,
    renderTextOnCanvas,
    renderDiagramOnCanvas,
  });

  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const isActive = status === "active" || status === "speaking";
  const isConnecting = status === "connecting";
  const isSpeaking = status === "speaking";
  const isIdle = status === "idle";
  const hasError = status === "error";

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio
            className={cn(
              "h-4 w-4",
              isActive ? "text-violet-500 animate-pulse" : "text-muted-foreground"
            )}
          />
          <div>
            <h1 className="text-sm font-semibold">Live Tutor</h1>
            <p className="text-xs text-muted-foreground">Gemini 3 Flash Live</p>
          </div>
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center gap-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-1">
            <Volume2 className="h-3.5 w-3.5 animate-pulse text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Speaking…</span>
          </div>
        )}

        {/* Mic listening indicator */}
        {isActive && !isSpeaking && (
          <div className="flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1">
            <Mic className="h-3.5 w-3.5 animate-pulse text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-700 dark:text-red-300">Listening…</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Transcript area */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-3 py-4">
          {transcript.length === 0 && isActive && (
            <p className="text-center text-xs text-muted-foreground pt-4">
              Start speaking — your tutor is listening.
            </p>
          )}

          {transcript.length === 0 && isIdle && !hasError && (
            <div className="flex flex-col items-center gap-3 pt-8 text-center text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                <Mic className="h-7 w-7 text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Office Hours Mode</p>
                <p className="mt-1 text-sm max-w-xs">
                  Connect to start a live voice session. Gemini will watch your whiteboard as you work through problems together.
                </p>
              </div>
            </div>
          )}

          {transcript.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex",
                line.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  line.role === "user"
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-secondary text-secondary-foreground",
                  line.partial && "opacity-70 italic"
                )}
              >
                {line.text}
              </div>
            </div>
          ))}

          <div ref={transcriptBottomRef} />
        </div>
      </ScrollArea>

      {/* Error */}
      {(error ?? hasError) && (
        <div className="mx-3 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error ?? "An error occurred. Please try again."}
        </div>
      )}

      {/* Connect / Disconnect control */}
      <div className="flex flex-shrink-0 flex-col items-center gap-2 border-t border-border p-4">
        {isActive || isSpeaking ? (
          <>
            <p className="text-xs text-muted-foreground">Session active — speak to ask your tutor</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-[40px] gap-2"
              onClick={() => void refreshWhiteboard()}
            >
              <Camera className="h-4 w-4" />
              Refresh whiteboard
            </Button>
            <Button
              type="button"
              variant={muted ? "destructive" : "outline"}
              className="min-h-[40px] gap-2"
              onClick={() => void toggleMute()}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {muted ? "Unmute" : "Mute"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px] min-w-[180px] gap-2"
              onClick={disconnect}
            >
              <PhoneOff className="h-4 w-4" />
              End Session
            </Button>
          </>
        ) : isConnecting ? (
          <>
            <p className="text-xs text-muted-foreground">Connecting to Gemini…</p>
            <Button
              type="button"
              variant="outline"
              disabled
              className="min-h-[44px] min-w-[180px] gap-2"
            >
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Connecting…
            </Button>
          </>
        ) : (
          <>
            {isIdle && !error && (
              <p className="text-xs text-muted-foreground">Mic + whiteboard will be shared</p>
            )}
            <Button
              type="button"
              className="min-h-[44px] min-w-[180px] gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => void connect()}
            >
              <PhoneCall className="h-4 w-4" />
              {hasError ? "Retry" : "Start Live Session"}
            </Button>
          </>
        )}

        {/* Mic permission note */}
        {isIdle && !isActive && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <MicOff className="h-3 w-3" />
            Microphone access required
          </p>
        )}
      </div>
    </div>
  );
}

export function LiveTutorPanel(props: LiveTutorPanelProps) {
  return (
    <ErrorBoundary label="Live Tutor">
      <LiveTutorPanelInner {...props} />
    </ErrorBoundary>
  );
}
