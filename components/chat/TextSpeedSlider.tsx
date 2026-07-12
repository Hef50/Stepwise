"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Gauge } from "lucide-react";
import {
  MIN_CPS,
  MAX_CPS_SLIDER,
  INSTANT_CPS,
  textSpeedLabel,
  parseCpsInput,
} from "@/lib/chat/textReveal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TextSpeedSliderProps {
  /** Chars/sec; `0` = instant. */
  value: number;
  onChange: (cps: number) => void;
}

export function TextSpeedSlider({ value, onChange }: TextSpeedSliderProps) {
  const isInstant = value <= 0;
  const sliderValue = isInstant ? MAX_CPS_SLIDER : Math.min(MAX_CPS_SLIDER, value);
  const [draft, setDraft] = useState(isInstant ? "" : String(value));

  useEffect(() => {
    setDraft(isInstant ? "" : String(value));
  }, [value, isInstant]);

  const commitDraft = () => {
    onChange(parseCpsInput(draft));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitDraft();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 items-center gap-1.5">
            <Gauge
              className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              type="range"
              min={MIN_CPS}
              max={MAX_CPS_SLIDER}
              step={0.5}
              value={sliderValue}
              onChange={(e) => {
                const n = Number(e.target.value);
                // Top of slider = instant
                if (n >= MAX_CPS_SLIDER) onChange(INSTANT_CPS);
                else onChange(n);
              }}
              aria-label="Text reading speed"
              aria-valuetext={
                isInstant ? "Instant" : `${value} characters per second`
              }
              className="h-1.5 w-[4.5rem] min-w-[3rem] flex-shrink cursor-pointer accent-primary"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            Reading &amp; equation draw speed —{" "}
            {isInstant ? "Instant" : `${value} chars/sec`}
          </p>
        </TooltipContent>
      </Tooltip>

      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={9999}
        step="any"
        value={draft}
        placeholder="∞"
        title="Chars per second (0 or empty = instant)"
        aria-label="Chars per second"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="h-7 w-14 flex-shrink-0 rounded-md border border-border bg-background px-1.5 text-center text-[11px] tabular-nums text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span className="hidden text-[10px] text-muted-foreground sm:inline">
        {isInstant ? "Instant" : "c/s"}
      </span>
      <span className="sr-only">{textSpeedLabel(value)}</span>
    </div>
  );
}
