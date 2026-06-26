"use client";

import { useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Send, Camera } from "lucide-react";
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
  isLoading,
  voice,
  files,
  onFilesChange,
  onCaptureWhiteboard,
  lastAssistantMessage,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // When voice transcript changes, fill the input
  useEffect(() => {
    if (voice.state.transcript && voice.state.mode === "idle") {
      onChange(voice.state.transcript);
    }
  }, [voice.state.transcript, voice.state.mode, onChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) {
        const form = e.currentTarget.closest("form");
        form?.requestSubmit();
      }
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 p-3 border-t border-border bg-background">
      {/* Voice status indicator */}
      {voice.state.mode === "listening" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-red-500" />
          Listening — speak your question…
        </div>
      )}

      {voice.state.error && (
        <p className="text-xs text-destructive px-1">{voice.state.error}</p>
      )}

      {/* Attached files preview strip */}
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
        {/* Left toolbar */}
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

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none overflow-hidden min-h-[44px] max-h-[200px] py-3"
          aria-label="Chat message input"
        />

        {/* Right toolbar */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <VoiceControls voice={voice} lastAssistantMessage={lastAssistantMessage} />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !value.trim()}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </form>
  );
}
