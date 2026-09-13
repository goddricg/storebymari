"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface DraftPayload<T> {
  data: T;
  timestamp: number;
}

interface UseFormDraftOptions<T> {
  formKey: string;
  initialData: T;
  maxAgeMs?: number; // default: 48 hours
  debounceMs?: number; // default: 600ms
  onRestore?: (data: T) => void;
}

export function useFormDraft<T extends Record<string, any>>({
  formKey,
  initialData,
  maxAgeMs = 48 * 60 * 60 * 1000,
  debounceMs = 600,
  onRestore,
}: UseFormDraftOptions<T>) {
  const [formData, setFormData] = useState<T>(initialData);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isInitialMount = useRef(true);
  const storageKey = `form_draft_${formKey}`;

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const payload = JSON.parse(raw) as DraftPayload<T>;
        const now = Date.now();
        if (payload.timestamp && now - payload.timestamp < maxAgeMs && payload.data) {
          // Verify draft contains non-empty fields
          const hasContent = Object.values(payload.data).some((val) => {
            if (typeof val === "string") return val.trim().length > 0;
            if (val !== null && val !== undefined) return true;
            return false;
          });

          if (hasContent) {
            setFormData(payload.data);
            setHasRestoredDraft(true);
            onRestore?.(payload.data);
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [storageKey, maxAgeMs, onRestore]);

  // Debounced auto-save
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      try {
        const hasContent = Object.values(formData).some((val) => {
          if (typeof val === "string") return val.trim().length > 0;
          if (val !== null && val !== undefined) return true;
          return false;
        });

        if (hasContent) {
          const payload: DraftPayload<T> = {
            data: formData,
            timestamp: Date.now(),
          };
          localStorage.setItem(storageKey, JSON.stringify(payload));
          setIsSaved(true);
        }
      } catch {
        // Ignore localStorage quota errors
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [formData, storageKey, debounceMs]);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsSaved(false);
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setHasRestoredDraft(false);
      setIsSaved(false);
    } catch {
      // Ignore
    }
  }, [storageKey]);

  return {
    formData,
    setFormData,
    updateField,
    hasRestoredDraft,
    isSaved,
    clearDraft,
  };
}
