"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import LibraryHeader from "@/components/library/LibraryHeader";
import LibrarySidebar from "@/components/library/LibrarySidebar";
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
  const pathname = usePathname();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchOverlay, setSearchOverlay] = useState<LibrarySearchOverlay>({
    kind: "none",
  });

  const fetchImages = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/images", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { images: ImageRecord[] };
      setImages(data.images);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/library") void fetchImages();
  }, [pathname, fetchImages]);

  // Backup refetch — catches previews that finish shortly after navigation.
  useEffect(() => {
    if (pathname !== "/library") return;
    const timer = setTimeout(() => {
      void fetchImages();
    }, 500);
    return () => clearTimeout(timer);
  }, [pathname, fetchImages]);

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
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <LibrarySidebar />
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
        <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <LibraryHeader
            onUploadComplete={fetchImages}
            isSearching={isSearching}
            onSearchStart={handleSearchStart}
            onSearchSuccess={handleSearchSuccess}
            onSearchAbort={handleSearchAbort}
            onSearchClear={handleSearchClear}
          />
          <PhotoGrid
            groups={groups}
            libraryLoading={libraryLoading}
            search={searchForGrid}
            onDeleteImage={handleDeleteImage}
          />
        </main>
      </div>
    </div>
  );
}
