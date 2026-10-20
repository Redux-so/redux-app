"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useState } from "react";

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
  const [navigating, setNavigating] = useState(false);

  async function handleClick() {
    if (navigating) return;
    setNavigating(true);
    try {
      if (editorPreview?.imageId) {
        await editorPreview.saveEditorState();
      }
      router.push("/library");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your edits.");
    } finally {
      setNavigating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={navigating}
      aria-label="Back to Library"
      title="Back to Library"
      className={`inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-md text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white cursor-pointer disabled:cursor-wait ${navigating ? "!opacity-100" : "disabled:opacity-60"}`}
    >
      {navigating ? (
        <LoadingSpinner
          size="sm"
          variant="muted"
          label="Returning to library"
          className="[&>span:first-child]:border-white/25 [&>span:first-child]:border-t-white/85"
        />
      ) : (
        <Icon name="ChevronLeft" size={24} aria-hidden />
      )}
    </button>
  );
}
