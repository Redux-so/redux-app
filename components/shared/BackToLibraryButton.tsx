"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useState, useTransition } from "react";

import { useEditorPreview } from "@/components/editor/EditorPreviewContext";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

/**
 * Navigates to /library. When rendered inside EditorPreviewProvider, saves the
 * editor preview first so library thumbnails stay current.
 */
export default function BackToLibraryButton() {
  const router = useRouter();
  const editorPreview = useEditorPreview();
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const navigating = saving || pending;

  async function handleClick() {
    if (navigating) return;
    setSaving(true);
    try {
      if (editorPreview?.imageId) {
        await editorPreview.saveEditorState();
      }
      startTransition(() => router.push("/library"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your edits.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={navigating}
      aria-busy={navigating}
      aria-label="Back to Library"
      title="Back to Library"
      className={`inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-md text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white cursor-pointer disabled:cursor-wait ${navigating ? "!opacity-100" : "disabled:opacity-60"}`}
    >
      {navigating ? (
        <LoadingSpinner
          size="sm"
          label="Returning to library"
        />
      ) : (
        <Icon name="ChevronLeft" size={24} aria-hidden />
      )}
    </button>
  );
}
