"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import LibraryHeader from "@/components/library/LibraryHeader";
import LibrarySidebar from "@/components/library/LibrarySidebar";
import PhotoGrid from "@/components/library/PhotoGrid";
import {
  applyLibraryFilters,
  applyLibrarySidebarView,
  countActiveLibraryFilters,
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilters,
  type LibrarySidebarView,
} from "@/lib/library-filters";
import { DEFAULT_LIBRARY_SIDEBAR_VIEW } from "@/constants/library-quick-filters";
import type { AlbumRecord } from "@/types/album";
import type { ImageRecord, ImageGroup } from "@/types/image";
import toast from "react-hot-toast";

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

/** Semantic search rows omit metadata — merge favorite flags from the library cache. */
function enrichSearchResultsWithFavorites(
  results: ImageRecord[],
  libraryImages: ImageRecord[],
): ImageRecord[] {
  const favoriteById = new Map(
    libraryImages.map((image) => [image.id, image.isFavorite === true]),
  );

  return results.map((image) => ({
    ...image,
    isFavorite: favoriteById.get(image.id) ?? image.isFavorite ?? false,
  }));
}

export default function LibraryPage() {
  const pathname = usePathname();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [searchOverlay, setSearchOverlay] = useState<LibrarySearchOverlay>({
    kind: "none",
  });
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [sidebarView, setSidebarView] = useState<LibrarySidebarView>(
    DEFAULT_LIBRARY_SIDEBAR_VIEW,
  );
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);

  const fetchAlbums = useCallback(async () => {
    try {
      const res = await fetch("/api/albums", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { albums: AlbumRecord[] };
      setAlbums(data.albums);
    } catch {
      // Non-blocking — sidebar shows empty state.
    }
  }, []);

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
    if (pathname === "/library") {
      void fetchImages();
      void fetchAlbums();
    }
  }, [pathname, fetchImages, fetchAlbums]);

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
    setAlbums((prev) =>
      prev.map((album) => ({
        ...album,
        imageIds: album.imageIds.filter((imageId) => imageId !== id),
      })),
    );
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

  const handleFavoriteToggle = useCallback((id: string, isFavorite: boolean) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, isFavorite } : img)),
    );
    setSearchOverlay((prev) =>
      prev.kind === "results"
        ? {
            ...prev,
            images: prev.images.map((img) =>
              img.id === id ? { ...img, isFavorite } : img,
            ),
          }
        : prev,
    );
  }, []);

  const handleAlbumMembershipChange = useCallback(
    (albumId: string, imageId: string, isMember: boolean) => {
      setAlbums((prev) =>
        prev.map((album) => {
          if (album.id !== albumId) return album;
          if (isMember) {
            return album.imageIds.includes(imageId)
              ? album
              : { ...album, imageIds: [imageId, ...album.imageIds] };
          }
          return {
            ...album,
            imageIds: album.imageIds.filter((id) => id !== imageId),
          };
        }),
      );
    },
    [],
  );

  const handleCreateAlbum = useCallback(async (name: string) => {
    try {
      const res = await fetch("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { album?: AlbumRecord; error?: string };
      if (!res.ok || !data.album) {
        toast.error(data.error ?? "Could not create album.");
        return false;
      }
      setAlbums((prev) => [data.album!, ...prev]);
      setSidebarView({ kind: "album", albumId: data.album.id });
      toast.success("Album created");
      return true;
    } catch {
      toast.error("Could not create album.");
      return false;
    }
  }, []);

  const albumMembershipByImageId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const album of albums) {
      for (const imageId of album.imageIds) {
        const existing = map.get(imageId);
        if (existing) {
          existing.add(album.id);
        } else {
          map.set(imageId, new Set([album.id]));
        }
      }
    }
    return map;
  }, [albums]);

  const filteredImages = useMemo(() => {
    const afterSidebarView = applyLibrarySidebarView(images, sidebarView, albums);
    return applyLibraryFilters(afterSidebarView, filters);
  }, [images, sidebarView, albums, filters]);

  const groups = groupImagesByMonth(filteredImages);

  const searchForGrid =
    searchOverlay.kind === "none"
      ? null
      : {
          loading: searchOverlay.kind === "loading",
          images:
            searchOverlay.kind === "results"
              ? applyLibraryFilters(
                  applyLibrarySidebarView(
                    enrichSearchResultsWithFavorites(
                      searchOverlay.images,
                      images,
                    ),
                    sidebarView,
                    albums,
                  ),
                  filters,
                )
              : [],
        };

  const isSearching = searchOverlay.kind === "loading";
  const filtersActive = countActiveLibraryFilters(filters) > 0;
  const selectedAlbum =
    sidebarView.kind === "album"
      ? albums.find((album) => album.id === sidebarView.albumId)
      : null;

  function getLibraryEmptyMessage(): string {
    if (sidebarView.kind === "album" && selectedAlbum) {
      return filtersActive
        ? `No photos in "${selectedAlbum.name}" match your filters`
        : `No photos in "${selectedAlbum.name}" yet`;
    }
    if (sidebarView.kind === "quick" && sidebarView.filter === "favorites") {
      return filtersActive
        ? "No favorite photos match your filters"
        : "No favorite photos yet";
    }
    if (sidebarView.kind === "quick" && sidebarView.filter === "recent") {
      return filtersActive
        ? "No photos from the last 7 days match your filters"
        : "No photos added in the last 7 days";
    }
    if (filtersActive && images.length > 0) {
      return "No photos match your filters";
    }
    return "Upload your first photo";
  }

  function getSearchEmptyMessage(): string {
    if (sidebarView.kind === "album" && selectedAlbum) {
      return filtersActive
        ? `No photos in "${selectedAlbum.name}" match your search and filters`
        : `No photos in "${selectedAlbum.name}" match your search`;
    }
    if (sidebarView.kind === "quick" && sidebarView.filter === "favorites") {
      return filtersActive
        ? "No favorite photos found matching your search and filters"
        : "No favorite photos found matching your search";
    }
    if (sidebarView.kind === "quick" && sidebarView.filter === "recent") {
      return filtersActive
        ? "No recent photos found matching your search and filters"
        : "No recent photos found matching your search";
    }
    return filtersActive
      ? "No photos found matching your search and filters"
      : "No photos found matching your search";
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <LibrarySidebar
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        albums={albums}
        onCreateAlbum={handleCreateAlbum}
      />
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
        <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <LibraryHeader
            onUploadComplete={fetchImages}
            isSearching={isSearching}
            onSearchStart={handleSearchStart}
            onSearchSuccess={handleSearchSuccess}
            onSearchAbort={handleSearchAbort}
            onSearchClear={handleSearchClear}
            filters={filters}
            onFiltersChange={setFilters}
          />
          <PhotoGrid
            groups={groups}
            libraryLoading={libraryLoading}
            search={searchForGrid}
            albums={albums}
            albumMembershipByImageId={albumMembershipByImageId}
            onDeleteImage={handleDeleteImage}
            onFavoriteToggle={handleFavoriteToggle}
            onAlbumMembershipChange={handleAlbumMembershipChange}
            libraryEmptyMessage={getLibraryEmptyMessage()}
            searchEmptyMessage={getSearchEmptyMessage()}
          />
        </main>
      </div>
    </div>
  );
}
