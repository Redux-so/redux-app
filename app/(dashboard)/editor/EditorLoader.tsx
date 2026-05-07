"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const EditorApp = dynamic(() => import("@/components/editor/EditorApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen bg-[#0a0a0a] items-center justify-center">
      <span className="text-[#555555] text-[14px]">Loading editor…</span>
    </div>
  ),
});

export default function EditorLoader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");

  useEffect(() => {
    if (!imageId) {
      router.replace("/library?redirected=true");
    }
  }, [imageId, router]);

  if (!imageId) return null;

  return <EditorApp />;
}
