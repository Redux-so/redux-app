"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const EditorApp = dynamic(() => import("@/components/editor/EditorApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen bg-[#0a0a0a] items-center justify-center">
      <span className="text-[#555555] text-[14px]">Loading editor…</span>
    </div>
  ),
});

export default function EditorPage() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");

  if (!imageId || imageId.trim() === "") return null;

  return <EditorApp />;
}
