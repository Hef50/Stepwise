"use client";

import { cn } from "@/lib/utils";
import type { ActiveModel } from "@/lib/types";

interface ModelStatusBadgeProps {
  model: ActiveModel;
  className?: string;
}

const MODEL_LABELS: Record<ActiveModel, string> = {
  llm7: "LLM7",
  gemma: "Gemma 4",
  "gemini-live": "Gemini 3 Live",
};

const MODEL_COLORS: Record<ActiveModel, string> = {
  llm7: "bg-muted text-muted-foreground",
  gemma: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "gemini-live": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

export function ModelStatusBadge({ model, className }: ModelStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        MODEL_COLORS[model],
        className
      )}
      title={`Active model: ${MODEL_LABELS[model]}`}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          model === "gemini-live" ? "animate-pulse bg-violet-500" : "bg-current opacity-60"
        )}
      />
      {MODEL_LABELS[model]}
    </span>
  );
}
