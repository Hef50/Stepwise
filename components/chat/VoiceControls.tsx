"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import type { VoiceControls as VoiceControlsType } from "@/lib/types";

interface VoiceControlsProps {
  voice: VoiceControlsType;
  lastAssistantMessage?: string;
}

function VoiceControlsInner({ voice, lastAssistantMessage }: VoiceControlsProps) {
  const { state, startListening, stopListening, speak, cancelSpeech, toggleSound, setVoiceSpeed } = voice;

  if (!state.sttSupported && !state.ttsSupported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            aria-label="Voice not supported"
          >
            <MicOff className="h-5 w-5 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Voice not supported in this browser</TooltipContent>
      </Tooltip>
    );
  }

  const isListening = state.mode === "listening";
  const isSpeaking = state.mode === "speaking";

  return (
    <div className="flex items-center gap-1">
      {state.sttSupported && <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={isListening ? stopListening : startListening}
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            className={cn(
              "transition-colors",
              isListening &&
                "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {isListening ? (
              <Mic className="h-5 w-5 animate-pulse" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isListening ? "Stop listening" : "Speak your question"}
        </TooltipContent>
      </Tooltip>}

      {/* TTS toggle */}
      {state.ttsSupported && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={isSpeaking ? cancelSpeech : () => lastAssistantMessage && speak(lastAssistantMessage)}
              disabled={!isSpeaking && !lastAssistantMessage}
              aria-label={isSpeaking ? "Stop reading" : "Read response aloud"}
              className={cn(
                "transition-colors",
                isSpeaking &&
                  "bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
              )}
            >
              {isSpeaking ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isSpeaking ? "Stop reading" : "Read response aloud"}
          </TooltipContent>
        </Tooltip>
      )}
      {state.ttsSupported && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              aria-label={state.soundEnabled ? "Mute automatic read aloud" : "Unmute automatic read aloud"}
            >
              {state.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{state.soundEnabled ? "Mute automatic read aloud" : "Unmute automatic read aloud"}</TooltipContent>
        </Tooltip>
      )}
      {state.ttsSupported && (
        <select
          aria-label="Voice speed"
          value={state.voiceSpeed}
          onChange={(event) => setVoiceSpeed(Number(event.target.value))}
          className="h-8 rounded-md border border-border bg-background px-1 text-xs"
        >
          <option value="0.75">0.75×</option>
          <option value="1">1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
        </select>
      )}
    </div>
  );
}

export function VoiceControls(props: VoiceControlsProps) {
  return (
    <ErrorBoundary label="Voice Controls">
      <VoiceControlsInner {...props} />
    </ErrorBoundary>
  );
}
