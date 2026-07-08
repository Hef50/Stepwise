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
import type {
  InteractionMode,
  VoiceControls as VoiceControlsType,
  UploadedFile,
} from "@/lib/types";

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
  interactionMode: InteractionMode;
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
  interactionMode,
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
  const voiceEnabled = interactionMode === "mixed";

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
            disabled={isLoading || (voiceEnabled && isListening)}
            rows={1}
            className="flex-1 min-h-[44px] w-full max-h-[200px] resize-none overflow-hidden py-3"
            aria-label="Chat message input"
          />
          {voiceEnabled && isListening && (
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
          {voiceEnabled && (
            <VoiceControls voice={voice} lastAssistantMessage={lastAssistantMessage} />
          )}
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
              disabled={(voiceEnabled && isListening) || !value.trim()}
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
