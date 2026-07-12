"use client";

import { useState } from "react";
import { Camera, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GeminiLiveControls } from "@/hooks/useGeminiLive";

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

export function AudioOnlyPanel({ live, onShareWhiteboard }: AudioOnlyPanelProps) {
  const { state, disconnect, toggleMute } = live;
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const isInCall = state.status === "connected" || state.status === "muted";
  const mainCaption =
    state.outputCaption ||
    state.inputCaption ||
    (state.status === "connecting"
      ? "Connecting…"
      : state.muted && isInCall
      ? "Muted"
      : isInCall
      ? "Listening…"
      : "Tap the phone to start your office-hours call");

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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-3xl rounded-xl border border-border bg-card px-8 py-12 shadow-sm">
          <p className="min-h-[8rem] text-balance text-2xl font-medium leading-relaxed text-foreground md:text-3xl">
            {mainCaption}
          </p>
        </div>

        {shareStatus && (
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">{shareStatus}</p>
        )}

        {state.error && (
          <p className="mt-4 max-w-xl text-sm text-destructive">{state.error}</p>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
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

        <p className="mt-6 max-w-md text-xs text-muted-foreground">
          {isInCall
            ? "Your whiteboard is shared automatically while you talk. Use the camera button to refresh it."
            : "Start a call, then speak naturally. Draw on the whiteboard and the AI will see your work."}
        </p>
      </div>
    </div>
  );
}
