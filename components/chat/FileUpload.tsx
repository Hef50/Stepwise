"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileImage, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { UploadedFile } from "@/lib/types";

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-orange-500" />;
}

export function FileUpload({ files, onFilesChange }: FileUploadProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = Array.from(e.target.files ?? []);

    const invalid = selected.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      setError(`Unsupported file type: ${invalid.map((f) => f.name).join(", ")}`);
      return;
    }

    const tooLarge = selected.filter((f) => f.size > MAX_SIZE_BYTES);
    if (tooLarge.length > 0) {
      setError(`File too large (max ${MAX_SIZE_MB}MB): ${tooLarge.map((f) => f.name).join(", ")}`);
      return;
    }

    const newFiles: UploadedFile[] = await Promise.all(
      selected.map(async (file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        dataUrl: await fileToDataUrl(file),
        size: file.size,
      }))
    );

    onFilesChange([...files, ...newFiles]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="relative"
        aria-label="Attach files"
      >
        <Paperclip className="h-5 w-5" />
        {files.length > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
            {files.length}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach Course Materials</DialogTitle>
            <DialogDescription>
              Upload images or PDFs to include in the AI context. Supported: JPG,
              PNG, WEBP, PDF (max {MAX_SIZE_MB}MB each).
            </DialogDescription>
          </DialogHeader>

          {/* Upload area */}
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Click to select files"
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Click to select files</p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WEBP, PDF up to {MAX_SIZE_MB}MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* File list */}
          {files.length > 0 && (
            <ScrollArea className="max-h-52">
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <FileIcon type={file.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(file.id)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
