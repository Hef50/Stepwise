"use client";

import { Pencil, Spline } from "lucide-react";
import type { DiagramStyle } from "@/lib/whiteboard/diagramStyle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WhiteboardDiagramControlsProps {
  style: DiagramStyle;
  onStyleChange: (style: DiagramStyle) => void;
  color: string;
  onColorChange: (color: string) => void;
}

export function WhiteboardDiagramControls({
  style,
  onStyleChange,
  color,
  onColorChange,
}: WhiteboardDiagramControlsProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
              aria-label="Diagram stroke color"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Diagram color</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex h-9 min-h-[36px] items-center rounded-md border border-border p-0.5"
            role="group"
            aria-label="Diagram draw style"
          >
            <button
              type="button"
              onClick={() => onStyleChange("sketchy")}
              aria-pressed={style === "sketchy"}
              aria-label="Sketchy hand-drawn style"
              className={cn(
                "flex h-7 min-h-[28px] min-w-[28px] items-center justify-center rounded px-1.5 text-[10px] font-medium transition-colors",
                style === "sketchy"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onStyleChange("clean")}
              aria-pressed={style === "clean"}
              aria-label="Clean geometric style"
              className={cn(
                "flex h-7 min-h-[28px] min-w-[28px] items-center justify-center rounded px-1.5 text-[10px] font-medium transition-colors",
                style === "clean"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Spline className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {style === "sketchy"
              ? "Sketchy (hand-drawn wobble)"
              : "Clean geometric strokes"}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
