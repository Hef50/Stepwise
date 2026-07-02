"use client";

import { useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceControls } from "./VoiceControls";
import { FileUpload } from "./FileUpload";
import { CourseMaterialUpload } from "./CourseMaterialUpload";
import type { VoiceControls as VoiceControlsType, UploadedFile, CourseMaterial } from "@/lib/types";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  isLoading: boolean;
  voice: VoiceControlsType;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  courseMaterials: CourseMaterial[];
  onAddCourseMaterial: (material: CourseMaterial) => void;
  onToggleCourseMaterial: (id: string) => void;
  onRemoveCourseMaterial: (id: string) => void;
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
  courseMaterials,
  onAddCourseMaterial,
  onToggleCourseMaterial,
  onRemoveCourseMaterial,
  lastAssistantMessage,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasListeningRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Voice transcript → input
  useEffect(() => {
    const { mode, transcript } = voice.state;
    if (mode === "listening") wasListeningRef.current = true;
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
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 p-3 border-t border-border bg-background"
    >
      {/* Voice error banner */}
      {voice.state.error && (
        <p className="text-xs text-destructive px-1">{voice.state.error}</p>
      )}

      {/* Attached file chips */}
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

      {/* ── Input row: attachments | textarea | voice + send ── */}
      <div className="flex items-end gap-2">
        {/* Left: file + course material buttons */}
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <FileUpload files={files} onFilesChange={onFilesChange} />
          <CourseMaterialUpload
            materials={courseMaterials}
            onAdd={onAddCourseMaterial}
            onToggle={onToggleCourseMaterial}
            onRemove={onRemoveCourseMaterial}
          />
        </div>

        {/* Centre: textarea with live-listen overlay */}
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? voice.state.transcript || "Listening…"
                : "Ask anything… (Enter to send)"
            }
            disabled={isLoading || isListening}
            rows={1}
            className="resize-none overflow-hidden min-h-[44px] max-h-[200px] py-3 w-full"
            aria-label="Chat message input"
          />
          {isListening && (
            <div className="absolute inset-0 flex items-start rounded-md bg-red-50/80 dark:bg-red-950/40 px-3 py-3 pointer-events-none">
              <div className="flex items-center gap-2 w-full">
                <span className="inline-block h-2 w-2 flex-shrink-0 animate-ping rounded-full bg-red-500" />
                <span className="text-sm text-red-700 dark:text-red-300 truncate">
                  {voice.state.transcript || "Listening — speak your question…"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: voice controls + send/stop */}
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
    </form>
  );
}
