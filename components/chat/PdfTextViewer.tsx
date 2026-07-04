"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PdfTextViewerProps {
  name: string;
  pageCount: number;
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PdfTextViewer({
  name,
  pageCount,
  text,
  open,
  onOpenChange,
}: PdfTextViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="truncate pr-8">{name}</DialogTitle>
          <DialogDescription>
            {pageCount} {pageCount === 1 ? "page" : "pages"} · extracted text
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-6 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {text}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
