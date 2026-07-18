"use client";

import { useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Send, Camera, Square, Library } from "lucide-react";
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
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onStop: () => void;
  isLoading: boolean;
  voice: VoiceControlsType;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onCaptureWhiteboard: () => void;
  onOpenCourseMaterials?: () => void;
  /** Number of enabled course materials — shown as a badge on the library button. */
  courseMaterialsActiveCount?: number;
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
  onOpenCourseMaterials,
  courseMaterialsActiveCount = 0,
  lastAssistantMessage,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasListeningRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    const { mode, transcript } = voice.state;

    if (mode === "listening") {
      wasListeningRef.current = true;
    }

    if (mode === "idle" && wasListeningRef.current) {
      wasListeningRef.current = false;
      if (transcript) {
        onChange(transcript);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    }
  }, [voice.state.mode, voice.state.transcript, onChange]);

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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 bg-background p-3">
      {voice.state.error && (
        <p className="text-xs text-destructive px-1">{voice.state.error}</p>
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

      <div className="relative w-full">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? voice.state.transcript
                ? voice.state.transcript
                : "Listening…"
              : "Ask anything…"
          }
          disabled={isLoading || isListening}
          rows={1}
          className="min-h-[44px] w-full resize-none overflow-hidden py-3"
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

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center">
          <FileUpload files={files} onFilesChange={onFilesChange} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 flex-shrink-0"
                onClick={onCaptureWhiteboard}
                aria-label="Send whiteboard to AI"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analyze whiteboard with AI vision</TooltipContent>
          </Tooltip>
          {onOpenCourseMaterials && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative h-11 w-11 flex-shrink-0"
                  onClick={onOpenCourseMaterials}
                  aria-label="Course materials"
                >
                  <Library className="h-5 w-5" />
                  {courseMaterialsActiveCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                      {courseMaterialsActiveCount > 9
                        ? "9+"
                        : courseMaterialsActiveCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Course materials</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <VoiceControls
            voice={voice}
            lastAssistantMessage={lastAssistantMessage}
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-11 w-11"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11"
              disabled={isListening || !value.trim()}
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
