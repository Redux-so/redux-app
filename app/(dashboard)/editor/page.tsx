"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";

const EditorApp = dynamic(() => import("@/components/editor/EditorApp"), {
  ssr: false,
  loading: () => (
    <LoadingOverlay
      className="h-screen bg-[#0a0a0a]"
      message="Loading editor"
      size="lg"
    />
  ),
});

export default function EditorPage() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");

  if (!imageId || imageId.trim() === "") return null;

  return <EditorApp />;
}
