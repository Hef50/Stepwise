"use client";

import { useRef, useState } from "react";
import { Eye, FileText, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfTextViewer } from "@/components/chat/PdfTextViewer";
import { cn } from "@/lib/utils";
import type { CourseMaterial } from "@/lib/types";

interface CourseMaterialsBarProps {
  materials: CourseMaterial[];
  isAdding: boolean;
  addError: string | null;
  onAddFromFile: (file: File) => Promise<boolean>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAddError: () => void;
}

export function CourseMaterialsBar({
  materials,
  isAdding,
  addError,
  onAddFromFile,
  onToggle,
  onRemove,
  onClearAddError,
}: CourseMaterialsBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<CourseMaterial | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onClearAddError();
    const ok = await onAddFromFile(file);
    if (ok) setAddOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const enabledCount = materials.filter((m) => m.enabled).length;

  return (
    <>
      <div className="border-t border-border bg-muted/20 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Course materials
            {materials.length > 0 && (
              <span className="ml-1.5 font-normal">
                · {enabledCount} of {materials.length} active
              </span>
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => {
              onClearAddError();
              setAddOpen(true);
            }}
            disabled={isAdding}
            aria-label="Add course material PDF"
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add PDF
          </Button>
        </div>

        {materials.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Upload syllabi or lecture PDFs — toggle them on/off as context for your questions.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {materials.map((material) => (
              <div
                key={material.id}
                className={cn(
                  "flex min-h-11 flex-shrink-0 items-center gap-1 rounded-full border pl-3 pr-1",
                  material.enabled
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background"
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(material.id)}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 py-2 text-left text-xs",
                    material.enabled ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-pressed={material.enabled}
                  aria-label={`${material.enabled ? "Disable" : "Enable"} ${material.name}`}
                >
                  <span
                    className={cn(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      material.enabled ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="max-w-[140px] truncate font-medium">{material.name}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => setViewing(material)}
                  aria-label={`View ${material.name}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(material.id)}
                  aria-label={`Remove ${material.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add course material</DialogTitle>
            <DialogDescription>
              Upload a PDF syllabus or lecture. It stays in your library — toggle it on when you
              want the AI to reference it.
            </DialogDescription>
          </DialogHeader>

          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
            onClick={() => !isAdding && inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && !isAdding && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Click to select a PDF"
          >
            {isAdding ? (
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {isAdding ? "Extracting text…" : "Click to select a PDF"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Max 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isAdding}
            />
          </div>

          {addError && <p className="text-sm text-destructive">{addError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={isAdding}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewing && (
        <PdfTextViewer
          name={viewing.name}
          pageCount={viewing.pageCount}
          text={viewing.text}
          open={viewing !== null}
          onOpenChange={(open) => !open && setViewing(null)}
        />
      )}
    </>
  );
}
