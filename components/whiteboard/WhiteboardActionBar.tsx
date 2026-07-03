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
 * Floating action bar overlaid on the tldraw canvas (top-centre).
 * Top-centre avoids tldraw's own UI: the main menu (top-left), the style
 * panel (top-right), and the toolbar (bottom-centre).
 */
export function WhiteboardActionBar({
  onDescribeWhiteboard,
  onCheckWork,
}: WhiteboardActionBarProps) {
  return (
    <TooltipProvider>
      <div className="pointer-events-none absolute top-3 left-1/2 z-[500] flex -translate-x-1/2 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onDescribeWhiteboard}
              className="pointer-events-auto gap-2 shadow-md border border-border bg-background/95 backdrop-blur-sm hover:bg-secondary"
            >
              <Camera className="h-4 w-4" />
              Describe
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ask the AI what&apos;s on the whiteboard</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onCheckWork}
              className="pointer-events-auto gap-2 shadow-md border border-border bg-background/95 backdrop-blur-sm hover:bg-secondary"
            >
              <ClipboardCheck className="h-4 w-4" />
              Check my work
            </Button>
          </TooltipTrigger>
          <TooltipContent>Have the AI grade your work on the whiteboard</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
