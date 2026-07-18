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

interface CourseMaterialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: CourseMaterial[];
  isAdding: boolean;
  addError: string | null;
  onAddFromFile: (file: File) => Promise<boolean>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAddError: () => void;
}

export function CourseMaterialsDialog({
  open,
  onOpenChange,
  materials,
  isAdding,
  addError,
  onAddFromFile,
  onToggle,
  onRemove,
  onClearAddError,
}: CourseMaterialsDialogProps) {
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(85vh,36rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="flex-shrink-0 space-y-1 border-b border-border px-4 py-3 text-left">
            <DialogTitle>Course materials</DialogTitle>
            <DialogDescription>
              {materials.length === 0
                ? "Upload syllabi or lecture PDFs to use as context."
                : `${enabledCount} of ${materials.length} active as context for your questions.`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2"
              onClick={() => {
                onClearAddError();
                setAddOpen(true);
              }}
              disabled={isAdding}
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add PDF
            </Button>

            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No materials yet. Add a PDF to get started — toggle it on when you
                want the AI to reference it.
              </p>
            ) : (
              <ul className="space-y-2">
                {materials.map((material) => (
                  <li
                    key={material.id}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-1",
                      material.enabled
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-background"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onToggle(material.id)}
                      className={cn(
                        "flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm",
                        material.enabled
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                      aria-pressed={material.enabled}
                      aria-label={`${material.enabled ? "Disable" : "Enable"} ${material.name}`}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 flex-shrink-0 rounded-full",
                          material.enabled
                            ? "bg-primary"
                            : "bg-muted-foreground/40"
                        )}
                      />
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {material.name}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                        {material.pageCount}p
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0"
                      onClick={() => setViewing(material)}
                      aria-label={`View ${material.name}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(material.id)}
                      aria-label={`Remove ${material.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add course material</DialogTitle>
            <DialogDescription>
              Upload a PDF syllabus or lecture. It stays in your library —
              toggle it on when you want the AI to reference it.
            </DialogDescription>
          </DialogHeader>

          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
            onClick={() => !isAdding && inputRef.current?.click()}
            onKeyDown={(e) =>
              e.key === "Enter" && !isAdding && inputRef.current?.click()
            }
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
          onOpenChange={(isOpen) => !isOpen && setViewing(null)}
        />
      )}
    </>
  );
}
