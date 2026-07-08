"use client";

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
  const { state, connect, disconnect, toggleMute, sendTextContext } = live;
  const isInCall = state.status === "connected" || state.status === "muted";
  const mainCaption =
    state.outputCaption || state.inputCaption || (isInCall ? "Listening" : "Ready");

  const handleShareWhiteboard = async () => {
    const context = await onShareWhiteboard();
    if (context) {
      await sendTextContext(
        `Use this current whiteboard context for the live tutoring call. Do not read this context aloud verbatim; use it to answer the student's spoken questions.\n\n${context}`
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Stepwise Live</h2>
          <p className="text-xs text-muted-foreground">AI Tutor</p>
        </div>
        <Badge variant={state.status === "error" ? "destructive" : "secondary"}>
          {statusLabel(state.status)}
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 grid w-full max-w-sm grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-4">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mic className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">You</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {state.inputCaption || (state.muted ? "Muted" : "Listening")}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-4">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              AI
            </div>
            <p className="text-sm font-medium">Stepwise</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {state.outputCaption ? "Speaking" : "Ready"}
            </p>
          </div>
        </div>

        <div className="w-full max-w-2xl rounded-lg border border-border bg-card px-6 py-8 shadow-sm">
          <p className="min-h-[6rem] text-balance text-2xl font-medium leading-relaxed text-foreground">
            {mainCaption}
          </p>
        </div>

        {state.error && (
          <p className="mt-4 max-w-xl text-sm text-destructive">{state.error}</p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {isInCall ? (
            <Button type="button" variant="destructive" size="icon" onClick={disconnect} aria-label="End call">
              <PhoneOff className="h-5 w-5" />
            </Button>
          ) : (
            <Button type="button" size="icon" onClick={connect} aria-label="Start call">
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
            className={cn(!state.muted && "text-emerald-700 dark:text-emerald-300")}
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
          >
            <Camera className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
