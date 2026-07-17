"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GeminiLiveControls } from "@/hooks/useGeminiLive";
import type { VoiceTranscriptEntry } from "@/lib/types";

interface AudioOnlyPanelProps {
  live: GeminiLiveControls;
  onShareWhiteboard: () => Promise<string | null>;
}

function statusLabel(status: GeminiLiveControls["state"]["status"]): string {
  if (status === "connecting") return "connecting";
  if (status === "connected") return "live";
  if (status === "muted") return "muted";
  if (status === "error") return "error";
  return "offline";
}

function speakerMeta(role: VoiceTranscriptEntry["role"]): {
  label: string;
  initials: string;
  className: string;
} {
  if (role === "user") {
    return {
      label: "You",
      initials: "Y",
      className: "bg-emerald-500 text-white",
    };
  }

  return {
    label: "AI TA",
    initials: "AI",
    className: "bg-sky-500 text-white",
  };
}

function TranscriptRow({
  role,
  text,
  live = false,
}: {
  role: VoiceTranscriptEntry["role"];
  text: string;
  live?: boolean;
}) {
  const speaker = speakerMeta(role);

  return (
    <div className={cn("grid grid-cols-[2rem_1fr] gap-3", live && "rounded-md bg-white/5 p-2")}>
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
          <p className="text-[11px] font-medium text-zinc-400">{speaker.label}</p>
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              Live
            </span>
          )}
        </div>
        <p
          className={cn(
            "whitespace-pre-wrap break-words leading-relaxed text-zinc-50",
            live ? "text-base md:text-lg" : "text-sm"
          )}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

export function AudioOnlyPanel({ live, onShareWhiteboard }: AudioOnlyPanelProps) {
  const { state, disconnect, toggleMute } = live;
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const isInCall = state.status === "connected" || state.status === "muted";
  const liveCaptionKey = `${state.inputCaption}|${state.outputCaption}`;
  const statusCaption =
    (state.status === "connecting"
      ? "Connecting…"
      : state.muted && isInCall
      ? "Muted"
      : isInCall
      ? "Listening…"
      : "Tap the phone to start your office-hours call");
  const hasCaptionRows =
    state.transcriptHistory.length > 0 ||
    Boolean(state.inputCaption) ||
    Boolean(state.outputCaption);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [liveCaptionKey, state.transcriptHistory.length]);

  const handleShareWhiteboard = async () => {
    setShareStatus("Sharing whiteboard…");
    try {
      const context = await onShareWhiteboard();
      if (context) {
        setShareStatus("Whiteboard shared with AI");
      } else {
        setShareStatus("Draw something on the whiteboard first");
      }
    } catch {
      setShareStatus("Could not share whiteboard — try again");
    }

    window.setTimeout(() => setShareStatus(null), 3000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Stepwise Live</h2>
          <p className="text-xs text-muted-foreground">Audio office hours</p>
        </div>
        <Badge variant={state.status === "error" ? "destructive" : "secondary"}>
          {statusLabel(state.status)}
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center px-4 py-5 text-center sm:px-6">
        <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-center">
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-zinc-950 text-left text-zinc-50 shadow-sm">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <p className="text-xs font-medium text-zinc-200">Call transcript</p>
              <p className="text-[11px] text-zinc-400">
                {state.transcriptHistory.length} saved caption
                {state.transcriptHistory.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {!hasCaptionRows ? (
                <div className="flex h-full min-h-[18rem] items-center justify-center text-center">
                  <p className="max-w-md text-balance text-xl font-medium leading-relaxed text-zinc-300 md:text-2xl">
                    {statusCaption}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.transcriptHistory.map((entry) => (
                    <TranscriptRow key={entry.id} role={entry.role} text={entry.text} />
                  ))}
                  {state.inputCaption && (
                    <TranscriptRow role="user" text={state.inputCaption} live />
                  )}
                  {state.outputCaption && (
                    <TranscriptRow role="assistant" text={state.outputCaption} live />
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {shareStatus && (
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">{shareStatus}</p>
        )}

        {state.error && (
          <p className="mt-4 max-w-xl text-sm text-destructive">{state.error}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {isInCall ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={disconnect}
              aria-label="End call"
              className="h-12 w-12"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={toggleMute}
              aria-label="Start call"
              className="h-12 w-12"
            >
              <Phone className="h-5 w-5" />
            </Button>
          )}

          <Button
            type="button"
            variant={state.muted ? "outline" : "secondary"}
            size="icon"
            onClick={toggleMute}
            disabled={state.status === "connecting"}
            aria-label={state.muted ? "Unmute" : "Mute"}
            className={cn("h-12 w-12", !state.muted && "text-emerald-700 dark:text-emerald-300")}
          >
            {state.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleShareWhiteboard}
            disabled={state.status === "connecting"}
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
