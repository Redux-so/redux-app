"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";

interface CreateAlbumModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<boolean>;
}

export default function CreateAlbumModal({
  open,
  onClose,
  onCreate,
}: CreateAlbumModalProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setSubmitting(false);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

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
      const ok = await onCreate(trimmed);
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
            key="create-album-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={() => {
              if (!submitting) onClose();
            }}
          />
          <motion.div
            key="create-album-modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-4"
          >
            <form
              onSubmit={handleSubmit}
              className="pointer-events-auto w-full max-w-[300px] rounded-lg border border-[#282828] bg-[#121212] p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[14px] font-medium text-white">New album</h2>
              <p className="mt-1 text-[12px] text-[#888888]">
                Group photos into a named collection.
              </p>

              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Album name"
                maxLength={80}
                disabled={submitting}
                className="mt-4 h-9 w-full rounded-lg border border-[#282828] bg-[#1d1d1d] px-3 text-[13px] text-white placeholder:text-[#555555] outline-none transition-colors focus:border-[#333333] disabled:opacity-50"
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
                  className={`${BTN_PRIMARY_SOLID} h-8 px-3 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
