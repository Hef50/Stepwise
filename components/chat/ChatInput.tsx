"use client";

import { useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Send, Camera, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VoiceControls } from "./VoiceControls";
import { FileUpload } from "./FileUpload";
import type { VoiceControls as VoiceControlsType, UploadedFile } from "@/lib/types";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  isLoading: boolean;
  voice: VoiceControlsType;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onCaptureWhiteboard: () => void;
  lastAssistantMessage?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  voice,
  files,
  onFilesChange,
  onCaptureWhiteboard,
  lastAssistantMessage,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        const form = e.currentTarget.closest("form");
        form?.requestSubmit();
      }
    }
  };

  const isListening = voice.state.mode === "listening";
  const captions = voice.state.captions || voice.state.transcript || "Listening…";
  const transcriptHistory = voice.state.transcriptHistory.slice(-4);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border bg-background p-3">
      {voice.state.error && (
        <p className="px-1 text-xs text-destructive">{voice.state.error}</p>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {files.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-shrink-0 items-center">
          <FileUpload files={files} onFilesChange={onFilesChange} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCaptureWhiteboard}
                aria-label="Send whiteboard to AI"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analyze whiteboard with AI vision</TooltipContent>
          </Tooltip>
        </div>

        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? voice.state.transcript || "Listening…"
                : "Ask anything… (Enter to send, Shift+Enter for new line)"
            }
            disabled={isLoading || isListening}
            rows={1}
            className="flex-1 min-h-[44px] w-full max-h-[200px] resize-none overflow-hidden py-3"
            aria-label="Chat message input"
          />
          {isListening && (
            <div className="pointer-events-none absolute inset-0 flex items-start rounded-md bg-red-50/80 px-3 py-3 dark:bg-red-950/40">
              <div className="flex w-full items-center gap-2">
                <span className="inline-block h-2 w-2 flex-shrink-0 animate-ping rounded-full bg-red-500" />
                <span className="truncate text-sm text-red-700 dark:text-red-300">
                  {voice.state.transcript || "Listening — speak your question…"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <VoiceControls voice={voice} lastAssistantMessage={lastAssistantMessage} />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={isListening || !value.trim()}
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-2">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>Voice captions</span>
          <span>{voice.state.nativeVoiceModeEnabled ? "native on" : "native off"}</span>
        </div>
        <div className="space-y-1 text-sm">
          <div className="rounded bg-background/70 px-2 py-1 text-foreground">{captions}</div>
          {transcriptHistory.length > 0 ? (
            transcriptHistory.map((entry) => (
              <div key={entry.id} className="rounded bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                <span className="mr-1 font-medium text-foreground">
                  {entry.role === "user" ? "You" : "AI"}:
                </span>
                {entry.text}
              </div>
            ))
          ) : (
            <div className="rounded bg-background/70 px-2 py-1 text-xs text-muted-foreground">
              Voice transcripts will appear here as you talk and respond.
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
