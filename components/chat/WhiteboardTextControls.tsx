"use client";

import { PenLine, Type } from "lucide-react";
import {
  MIN_WB_TEXT_SIZE,
  MAX_WB_TEXT_SIZE,
  WB_TEXT_SIZE_STEP,
  wbTextSizeLabel,
  type WhiteboardTextMode,
} from "@/lib/whiteboard/textStyle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WhiteboardTextControlsProps {
  size: number;
  onSizeChange: (size: number) => void;
  color: string;
  onColorChange: (color: string) => void;
  mode: WhiteboardTextMode;
  onModeChange: (mode: WhiteboardTextMode) => void;
}

export function WhiteboardTextControls({
  size,
  onSizeChange,
  color,
  onColorChange,
  mode,
  onModeChange,
}: WhiteboardTextControlsProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PenLine
              className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              type="range"
              min={MIN_WB_TEXT_SIZE}
              max={MAX_WB_TEXT_SIZE}
              step={WB_TEXT_SIZE_STEP}
              value={size}
              onChange={(e) => onSizeChange(Number(e.target.value))}
              aria-label="Whiteboard text size"
              aria-valuetext={`${wbTextSizeLabel(size)} (${size}px)`}
              className="h-1.5 w-[4.5rem] min-w-[3rem] flex-shrink cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {size}px
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            Label size — {wbTextSizeLabel(size)} ({size}px)
          </p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <label className="relative flex h-9 w-9 min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-md hover:bg-muted">
            <span
              className="h-4 w-4 rounded-full border border-border shadow-sm"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              aria-label="Whiteboard text color"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Label color</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex h-9 min-h-[36px] items-center rounded-md border border-border p-0.5"
            role="group"
            aria-label="Handwriting style"
          >
            <button
              type="button"
              onClick={() => onModeChange("stroke")}
              aria-pressed={mode === "stroke"}
              aria-label="Pen stroke mode"
              className={cn(
                "flex h-7 min-h-[28px] min-w-[28px] items-center justify-center rounded px-1.5 text-[10px] font-medium transition-colors",
                mode === "stroke"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onModeChange("outline")}
              aria-pressed={mode === "outline"}
              aria-label="Outline handwriting mode"
              className={cn(
                "flex h-7 min-h-[28px] min-w-[28px] items-center justify-center rounded px-1.5 text-[10px] font-medium transition-colors",
                mode === "outline"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Type className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {mode === "stroke"
              ? "Pen strokes (single-line)"
              : "Outline handwriting"}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
