"use client";

import { Camera, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WhiteboardActionBarProps {
  onDescribeWhiteboard: () => void;
  onCheckWork: () => void;
}

/**
 * Floating action bar overlaid on the tldraw canvas (top-right corner).
 * Houses whiteboard-specific AI actions so the chat input stays uncluttered.
 */
export function WhiteboardActionBar({
  onDescribeWhiteboard,
  onCheckWork,
}: WhiteboardActionBarProps) {
  return (
    <TooltipProvider>
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={onDescribeWhiteboard}
              aria-label="Describe whiteboard"
              className="h-10 w-10 shadow-md border border-border bg-background/90 backdrop-blur-sm hover:bg-secondary"
            >
              <Camera className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">What&apos;s on my whiteboard?</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={onCheckWork}
              aria-label="Check my work"
              className="h-10 w-10 shadow-md border border-border bg-background/90 backdrop-blur-sm hover:bg-secondary"
            >
              <ClipboardCheck className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Check my work</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
