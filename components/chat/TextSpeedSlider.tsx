"use client";

import { Gauge } from "lucide-react";
import {
  MAX_TEXT_SPEED,
  textSpeedLabel,
} from "@/lib/chat/textReveal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TextSpeedSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function TextSpeedSlider({ value, onChange }: TextSpeedSliderProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 items-center gap-2">
          <Gauge
            className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="range"
            min={1}
            max={MAX_TEXT_SPEED}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Text reading speed"
            aria-valuetext={textSpeedLabel(value)}
            className="h-1.5 w-[4.5rem] flex-shrink-0 cursor-pointer accent-primary"
          />
          <span className="hidden w-14 truncate text-[10px] text-muted-foreground sm:inline">
            {textSpeedLabel(value)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">Reading speed — {textSpeedLabel(value)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
