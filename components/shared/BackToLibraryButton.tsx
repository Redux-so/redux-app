"use client";

import { useRouter } from "next/navigation";
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
        await editorPreview.savePreview();
      }
      router.push("/library");
    } finally {
      setNavigating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={navigating}
      className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white disabled:cursor-wait disabled:opacity-60 cursor-pointer"
    >
      {navigating ? (
        <LoadingSpinner size="xs" label="Returning to library" />
      ) : (
        <Icon name="ChevronLeft" size={20} aria-hidden />
      )}
      Back to Library
    </button>
  );
}
