"use client";

import { useRef, useState } from "react";
import { BookOpen, Check, Loader2, Trash2, ToggleLeft, ToggleRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CourseMaterial, PdfExtractResponse } from "@/lib/types";

interface CourseMaterialUploadProps {
  materials: CourseMaterial[];
  onAdd: (material: CourseMaterial) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function generateId() {
  return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function CourseMaterialUpload({
  materials,
  onAdd,
  onToggle,
  onRemove,
}: CourseMaterialUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCount = materials.filter((m) => m.active).length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/materials/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as PdfExtractResponse;

      const material: CourseMaterial = {
        id: generateId(),
        name: data.name,
        text: data.text,
        pageCount: data.pageCount,
        uploadedAt: new Date().toISOString(),
        active: true,
      };

      onAdd(material);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-uploaded after removal
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Course materials"
              className="relative"
            >
              <BookOpen className="h-5 w-5" />
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Course materials &amp; syllabus</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Course Materials
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Upload PDFs (syllabus, notes, textbook chapters). Active materials are
          injected into the tutor&apos;s context so it can answer syllabus-specific
          questions.
        </p>

        {/* Upload button */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload PDF"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting text…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload PDF
              </>
            )}
          </Button>
          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}
        </div>

        {/* Material list */}
        {materials.length > 0 && (
          <>
            <Separator />
            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-2 pr-2">
                {materials.map((mat) => (
                  <MaterialRow
                    key={mat.id}
                    material={mat}
                    onToggle={onToggle}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {materials.length === 0 && !uploading && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No materials uploaded yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MaterialRowProps {
  material: CourseMaterial;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function MaterialRow({ material, onToggle, onRemove }: MaterialRowProps) {
  const wordCount = material.text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3">
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{material.name}</p>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {material.pageCount} {material.pageCount === 1 ? "page" : "pages"}
          </Badge>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            ~{wordCount.toLocaleString()} words
          </Badge>
          {material.active && (
            <Badge className="text-xs px-1.5 py-0 bg-green-600 hover:bg-green-600">
              <Check className="mr-0.5 h-2.5 w-2.5" />
              Active
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggle(material.id)}
              aria-label={material.active ? "Deactivate" : "Activate"}
            >
              {material.active ? (
                <ToggleRight className="h-4 w-4 text-green-600" />
              ) : (
                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {material.active ? "Remove from context" : "Add to context"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(material.id)}
              aria-label="Delete material"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
