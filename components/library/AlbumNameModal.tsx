"use client";

import { usePopupMotion } from "@/lib/popup-motion";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BTN_BRAND_SOLID } from "@/lib/button-styles";

interface AlbumNameModalProps {
  open: boolean;
  initialName?: string;
  mode?: "create" | "rename";
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}

export default function AlbumNameModal({
  open,
  onClose,
  onSave,
  initialName = "",
  mode = "create",
}: AlbumNameModalProps) {
  const popupMotion = usePopupMotion();
  const backdropMotion = usePopupMotion(true);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setSubmitting(false);
      return;
    }
    setName(initialName);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const ok = await onSave(trimmed);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="album-name-backdrop"
            {...backdropMotion}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={() => {
              if (!submitting) onClose();
            }}
          />
          <motion.div
            key="album-name-modal"
            {...popupMotion}
            className="viewport-modal fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-4"
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="album-name-title"
              onSubmit={handleSubmit}
              className="pointer-events-auto w-full max-w-[300px] max-h-[calc(var(--app-height,100dvh)-32px)] overflow-y-auto rounded-lg border border-[#212121] bg-[#121212] p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="album-name-title" className="text-[14px] font-medium text-white">{mode === "rename" ? "Rename album" : "New album"}</h2>
              <p className="mt-1 text-[12px] text-[#888888]">
                {mode === "rename" ? "Choose a new name for this album." : "Group photos into a named collection."}
              </p>

              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Album name"
                placeholder="Album name"
                maxLength={80}
                disabled={submitting}
                className="mt-4 h-9 w-full rounded-lg border border-[#262626] bg-[#1d1d1d] px-3 text-[13px] text-white placeholder:text-[#555555] outline-none transition-colors focus:border-[#2e2e2e] disabled:opacity-50"
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-8 rounded-md px-3 text-[13px] font-medium text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !name.trim()}
                  className={`${BTN_BRAND_SOLID} h-8 px-3 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting ? <LoadingSpinner size="xs" label={mode === "rename" ? "Saving album" : "Creating album"} /> : (mode === "rename" ? "Save" : "Create")}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
