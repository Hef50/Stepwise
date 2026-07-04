"use client";

import { useCallback, useEffect, useState } from "react";
import { extractPdfText, fileToDataUrl } from "@/lib/chat/extractPdf";
import type { CourseMaterial, MessagePdfAttachment } from "@/lib/types";

const STORAGE_KEY = "stepwise_course_materials";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface UseCourseMaterialsReturn {
  materials: CourseMaterial[];
  enabledMaterials: CourseMaterial[];
  isHydrated: boolean;
  isAdding: boolean;
  addError: string | null;
  addFromFile: (file: File) => Promise<boolean>;
  toggleMaterial: (id: string) => void;
  removeMaterial: (id: string) => void;
  clearAddError: () => void;
}

export function toMessageAttachment(material: CourseMaterial): MessagePdfAttachment {
  return {
    id: material.id,
    name: material.name,
    pageCount: material.pageCount,
    text: material.text,
  };
}

export function useCourseMaterials(): UseCourseMaterialsReturn {
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CourseMaterial[];
        if (Array.isArray(parsed)) {
          setMaterials(parsed);
        }
      }
    } catch {
      // Corrupt storage — start fresh
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
    } catch {
      // Quota exceeded — silently continue
    }
  }, [materials, isHydrated]);

  const addFromFile = useCallback(async (file: File): Promise<boolean> => {
    setAddError(null);

    if (file.type !== "application/pdf") {
      setAddError("Only PDF files are supported for course materials.");
      return false;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setAddError("PDF exceeds maximum size of 10 MB.");
      return false;
    }

    setIsAdding(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const extracted = await extractPdfText(dataUrl, file.name);
      if (!extracted) {
        setAddError("Failed to extract text from PDF.");
        return false;
      }

      const material: CourseMaterial = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: extracted.name,
        pageCount: extracted.pageCount,
        text: extracted.text,
        enabled: true,
        addedAt: new Date().toISOString(),
      };

      setMaterials((prev) => [...prev, material]);
      return true;
    } finally {
      setIsAdding(false);
    }
  }, []);

  const toggleMaterial = useCallback((id: string) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearAddError = useCallback(() => setAddError(null), []);

  const enabledMaterials = materials.filter((m) => m.enabled);

  return {
    materials,
    enabledMaterials,
    isHydrated,
    isAdding,
    addError,
    addFromFile,
    toggleMaterial,
    removeMaterial,
    clearAddError,
  };
}
