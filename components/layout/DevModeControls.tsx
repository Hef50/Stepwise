"use client";

import { Bug, FlaskConical } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DevModeControlsProps {
  devMode: boolean;
  onDevModeChange: (enabled: boolean) => void;
  forceLlm7Fail: boolean;
  onForceLlm7FailChange: (enabled: boolean) => void;
  className?: string;
}

export function DevModeControls({
  devMode,
  onDevModeChange,
  forceLlm7Fail,
  onForceLlm7FailChange,
  className,
}: DevModeControlsProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("flex items-center gap-1.5", className)}>
        {devMode && (
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
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                const next = !devMode;
                onDevModeChange(next);
                if (!next) onForceLlm7FailChange(false);
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
