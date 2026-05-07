"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ImageIcon } from "lucide-react";
import Header from "@/components/shared/Header";
import BottomNav from "@/components/shared/BottomNav";
import PhotoGrid from "@/components/library/PhotoGrid";
import type { ImageRecord, ImageGroup } from "@/types/image";

function groupImagesByMonth(images: ImageRecord[]): ImageGroup[] {
  if (!images.length) return [];

  const now = new Date();
  const groupMap = new Map<string, ImageRecord[]>();

  for (const image of images) {
    const date = new Date(image.createdAt);
    const sameMonth =
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const label = sameMonth
      ? "RECENT"
      : date
          .toLocaleDateString("en-US", { month: "long", year: "numeric" })
          .toUpperCase();

    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label)!.push(image);
  }

  return Array.from(groupMap.entries()).map(([label, imgs]) => ({
    label,
    images: imgs,
  }));
}

/** Single source of truth so loading vs results never get out of sync (fixes empty grid after 200). */
type LibrarySearchOverlay =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "results"; images: ImageRecord[] };

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toastFiredRef = useRef(false);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchOverlay, setSearchOverlay] = useState<LibrarySearchOverlay>({
    kind: "none",
  });

  // Show toast when redirected from the editor without an image selected
  useEffect(() => {
    if (searchParams.get("redirected") !== "true") return;
    if (toastFiredRef.current) return;
    toastFiredRef.current = true;
    router.replace("/library");
    toast.custom(
      () => (
        <div
          className="flex items-center gap-2.5 rounded-sm border border-[#22c55e] bg-[#111111] px-[14px] py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >
          <ImageIcon size={16} color="#22c55e" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          <span style={{ color: "#ffffff", fontSize: "13px", fontFamily: "-apple-system, system-ui, sans-serif" }}>
            Select a photo from your library to start editing
          </span>
        </div>
      ),
      { duration: 4000, position: "top-left", style: { marginLeft: 20, marginTop: 72 } },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchImages = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/images");
      if (!res.ok) return;
      const data = (await res.json()) as { images: ImageRecord[] };
      setImages(data.images);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleDeleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSearchOverlay((prev) =>
      prev.kind === "results"
        ? { ...prev, images: prev.images.filter((img) => img.id !== id) }
        : prev,
    );
  }, []);

  const handleSearchStart = useCallback(() => {
    setSearchOverlay({ kind: "loading" });
  }, []);

  const handleSearchSuccess = useCallback((nextImages: ImageRecord[]) => {
    setSearchOverlay({ kind: "results", images: nextImages });
  }, []);

  const handleSearchAbort = useCallback(() => {
    setSearchOverlay({ kind: "none" });
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchOverlay({ kind: "none" });
  }, []);

  const groups = groupImagesByMonth(images);

  const searchForGrid =
    searchOverlay.kind === "none"
      ? null
      : {
          loading: searchOverlay.kind === "loading",
          images:
            searchOverlay.kind === "results" ? searchOverlay.images : [],
        };

  const isSearching = searchOverlay.kind === "loading";

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <Header
        onUploadComplete={fetchImages}
        isSearching={isSearching}
        onSearchStart={handleSearchStart}
        onSearchSuccess={handleSearchSuccess}
        onSearchAbort={handleSearchAbort}
        onSearchClear={handleSearchClear}
      />
      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <PhotoGrid
          groups={groups}
          libraryLoading={libraryLoading}
          search={searchForGrid}
          onDeleteImage={handleDeleteImage}
        />
      </main>
      <BottomNav />
    </div>
  );
}
