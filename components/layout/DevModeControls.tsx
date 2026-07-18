"use client";

import { Bug, FlaskConical, Timer } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Preset hold durations (ms) for prolonging the typing indicator in Dev Mode. */
export const TYPING_HOLD_PRESETS_MS = [0, 1500, 3000, 5000] as const;

interface DevModeControlsProps {
  devMode: boolean;
  onDevModeChange: (enabled: boolean) => void;
  forceLlm7Fail: boolean;
  onForceLlm7FailChange: (enabled: boolean) => void;
  /** Minimum ms to show the typing indicator after a request starts. */
  typingHoldMs: number;
  onTypingHoldMsChange: (ms: number) => void;
  className?: string;
}

function formatHoldLabel(ms: number): string {
  if (ms <= 0) return "Off";
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DevModeControls({
  devMode,
  onDevModeChange,
  forceLlm7Fail,
  onForceLlm7FailChange,
  typingHoldMs,
  onTypingHoldMsChange,
  className,
}: DevModeControlsProps) {
  const cycleTypingHold = () => {
    const idx = TYPING_HOLD_PRESETS_MS.indexOf(
      typingHoldMs as (typeof TYPING_HOLD_PRESETS_MS)[number]
    );
    const next =
      TYPING_HOLD_PRESETS_MS[
        (idx >= 0 ? idx + 1 : 0) % TYPING_HOLD_PRESETS_MS.length
      ];
    onTypingHoldMsChange(next);
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("flex items-center gap-1.5", className)}>
        {devMode && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={cycleTypingHold}
                  aria-label={`Typing hold ${formatHoldLabel(typingHoldMs)}`}
                  className={cn(
                    "flex h-9 min-w-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                    typingHoldMs > 0
                      ? "bg-sky-100 text-sky-800 ring-1 ring-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Timer className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Hold {formatHoldLabel(typingHoldMs)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                Prolong the typing-dots animation before the reply appears.
                Cycles Off → 1.5s → 3s → 5s. Useful when the LLM responds
                instantly.
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onForceLlm7FailChange(!forceLlm7Fail)}
                  aria-pressed={forceLlm7Fail}
                  aria-label="Toggle test API error"
                  className={cn(
                    "flex h-9 min-w-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                    forceLlm7Fail
                      ? "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {forceLlm7Fail ? "API fail on" : "Test API error"}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                When on, LLM7 chat requests fail immediately so you can test the
                error banner, Retry, and escalate buttons.
              </TooltipContent>
            </Tooltip>
          </>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                const next = !devMode;
                onDevModeChange(next);
                if (!next) {
                  onForceLlm7FailChange(false);
                  onTypingHoldMsChange(0);
                }
              }}
              aria-pressed={devMode}
              aria-label="Toggle Dev Mode"
              className={cn(
                "flex h-9 min-w-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                devMode
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Bug className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dev</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px]">
            {devMode
              ? 'Dev Mode on. Type "t" in chat for a whiteboard smoke test (no LLM tokens).'
              : "Enable Dev Mode for test tools and the \"t\" smoke-test shortcut."}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
