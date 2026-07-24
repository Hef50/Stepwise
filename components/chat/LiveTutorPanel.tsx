"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { cn } from "@/lib/utils";
import type { CanvasPayload, LiveTranscriptLine } from "@/lib/types";
import type { DiagramSpec } from "@/lib/whiteboard/diagramSpec";

interface LiveTutorPanelProps {
  captureWhiteboard: () => Promise<CanvasPayload | null>;
  renderLatexOnCanvas?: (latex: string, displayMode?: boolean) => Promise<string | null>;
  renderTextOnCanvas?: (text: string) => Promise<string | null>;
  renderDiagramOnCanvas?: (spec: DiagramSpec | string) => Promise<string | null>;
}

function speakerMeta(role: LiveTranscriptLine["role"]) {
  return role === "user"
    ? { label: "You", initials: "Y", className: "bg-emerald-500 text-white" }
    : { label: "AI TA", initials: "AI", className: "bg-sky-500 text-white" };
}

function TranscriptRow({ line }: { line: LiveTranscriptLine }) {
  const speaker = speakerMeta(line.role);

  return (
    <div className={cn("grid grid-cols-[2rem_1fr] gap-3", line.partial && "rounded-md bg-sky-50 p-2 dark:bg-sky-950/30")}>
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold",
          speaker.className
        )}
        aria-label={speaker.label}
      >
        {speaker.initials}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-medium text-muted-foreground">{speaker.label}</p>
          {line.partial && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600 dark:bg-sky-300" />
              Live
            </span>
          )}
        </div>
        <p
          className={cn(
            "whitespace-pre-wrap break-words leading-relaxed text-foreground",
            line.partial ? "text-base md:text-lg" : "text-sm"
          )}
        >
          {line.text}
        </p>
      </div>
    </div>
  );
}

function statusLabel(status: "idle" | "connecting" | "active" | "speaking" | "error") {
  if (status === "connecting") return "connecting";
  if (status === "active" || status === "speaking") return "live";
  if (status === "error") return "error";
  return "offline";
}

function LiveTutorPanelInner({
  captureWhiteboard,
  renderLatexOnCanvas,
  renderTextOnCanvas,
  renderDiagramOnCanvas,
}: LiveTutorPanelProps) {
  const { status, muted, transcript, error, connect, disconnect, toggleMute, refreshWhiteboard } = useGeminiLive({
    captureWhiteboard,
    renderLatexOnCanvas,
    renderTextOnCanvas,
    renderDiagramOnCanvas,
  });
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const isInCall = status === "active" || status === "speaking";
  const hasCaptionRows = transcript.some((line) => line.text.trim());

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [transcript]);

  const handleShareWhiteboard = async () => {
    setShareStatus("Sharing whiteboard…");
    const shared = await refreshWhiteboard();
    setShareStatus(shared ? "Whiteboard shared with AI" : "Draw something on the whiteboard first");
    window.setTimeout(() => setShareStatus(null), 3000);
  };

  const statusCaption =
    status === "connecting"
      ? "Connecting…"
      : muted && isInCall
        ? "Muted"
        : isInCall
          ? status === "speaking" ? "AI TA is speaking…" : "Listening…"
          : "Tap the phone to start your office-hours call";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Stepwise Live</h2>
          <p className="text-xs text-muted-foreground">Audio office hours</p>
        </div>
        <Badge variant={status === "error" ? "destructive" : "secondary"}>{statusLabel(status)}</Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center px-4 py-5 text-center sm:px-6">
        <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center">
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background text-left shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
              <p className="text-xs font-medium text-foreground">Call transcript</p>
              <p className="text-[11px] text-muted-foreground">
                {transcript.filter((line) => !line.partial).length} saved caption{transcript.filter((line) => !line.partial).length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {!hasCaptionRows ? (
                <div className="flex h-full min-h-[18rem] items-center justify-center text-center">
                  <p className="max-w-md text-balance text-xl font-medium leading-relaxed text-muted-foreground md:text-2xl">{statusCaption}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transcript.filter((line) => line.text.trim()).map((line) => <TranscriptRow key={line.id} line={line} />)}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {shareStatus && <p className="mt-4 max-w-xl text-sm text-muted-foreground">{shareStatus}</p>}
        {error && <p className="mt-4 max-w-xl text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {isInCall ? (
            <Button type="button" variant="destructive" size="icon" onClick={disconnect} aria-label="End call" className="h-12 w-12">
              <PhoneOff className="h-5 w-5" />
            </Button>
          ) : (
            <Button type="button" size="icon" onClick={() => void connect()} disabled={status === "connecting"} aria-label="Start call" className="h-12 w-12">
              <Phone className="h-5 w-5" />
            </Button>
          )}

          <Button
            type="button"
            variant={muted ? "outline" : "secondary"}
            size="icon"
            onClick={() => void toggleMute()}
            disabled={!isInCall}
            aria-label={muted ? "Unmute" : "Mute"}
            className={cn("h-12 w-12", !muted && "text-emerald-700 dark:text-emerald-300")}
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void handleShareWhiteboard()}
            disabled={!isInCall}
            aria-label="Share whiteboard"
            className="h-12 w-12"
          >
            <Camera className="h-5 w-5" />
          </Button>
        </div>

        <p className="mt-4 max-w-md text-xs text-muted-foreground">
          {isInCall
            ? "Your whiteboard is shared automatically while you talk. Use the camera button to refresh it."
            : "Start a call, then speak naturally. Draw on the whiteboard and the AI will see your work."}
        </p>
      </div>
    </div>
  );
}

export function LiveTutorPanel(props: LiveTutorPanelProps) {
  return <ErrorBoundary label="Live Tutor"><LiveTutorPanelInner {...props} /></ErrorBoundary>;
}
