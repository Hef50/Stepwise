"use client";

import { Type } from "lucide-react";
import {
  MIN_LATEX_FONT_SIZE,
  MAX_LATEX_FONT_SIZE,
  LATEX_FONT_SIZE_STEP,
  latexFontSizeLabel,
} from "@/lib/whiteboard/latexFontSize";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LatexFontSizeSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function LatexFontSizeSlider({
  value,
  onChange,
}: LatexFontSizeSliderProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Type
            className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="range"
            min={MIN_LATEX_FONT_SIZE}
            max={MAX_LATEX_FONT_SIZE}
            step={LATEX_FONT_SIZE_STEP}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="LaTeX equation size"
            aria-valuetext={`${latexFontSizeLabel(value)} (${value}px)`}
            className="h-1.5 w-[4.5rem] min-w-[3rem] flex-shrink cursor-pointer accent-primary"
          />
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {value}px
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">
          Equation size — {latexFontSizeLabel(value)} ({value}px)
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
