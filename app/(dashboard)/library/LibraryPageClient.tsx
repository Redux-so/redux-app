"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { LIBRARY_PAGE_SIZE } from "@/constants/library-pagination";
import { mergeImageRecords } from "@/lib/merge-image-records";
import { recallLibraryView, rememberLibraryView, restoreLibraryPages } from "@/lib/library-view-cache";
import {
  LIBRARY_PREVIEW_UPDATED_EVENT,
  applyLibraryPreviewUpdates,
  consumeLibraryPreviewUpdates,
  type LibraryPreviewUpdates,
} from "@/lib/library-preview-sync";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import { useImageUpload } from "@/hooks/useImageUpload";
import LibraryHeader from "@/components/library/LibraryHeader";
import LibrarySidebar from "@/components/library/LibrarySidebar";
import PhotoGrid from "@/components/library/PhotoGrid";
import TrashViewToolbar from "@/components/library/TrashViewToolbar";
import {
  applyLibraryFilters,
  applyLibraryViewAndFilters,
  countActiveLibraryFilters,
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilters,
  type LibrarySidebarView,
} from "@/lib/library-filters";
import { DEFAULT_LIBRARY_SIDEBAR_VIEW } from "@/constants/library-quick-filters";
import type { AlbumRecord } from "@/types/album";
import type { ImageRecord, ImageGroup } from "@/types/image";
import toast from "react-hot-toast";

function groupImagesByDeletedMonth(images: ImageRecord[]): ImageGroup[] {
  if (!images.length) return [];

  const groupMap = new Map<string, ImageRecord[]>();

  for (const image of images) {
    const deletedAt = image.deletedAt ?? image.createdAt;
    const date = new Date(deletedAt);
    const label = date
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

type ImagesPageResponse = {
  images: ImageRecord[];
  total: number;
  page: number;
  limit: number;
};

export interface LibraryInitialPage {
  images: ImageRecord[];
  total: number;
}

function buildImagesListUrl(trash: boolean, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIBRARY_PAGE_SIZE),
  });
  if (trash) params.set("trash", "1");
  return `/api/images?${params.toString()}`;
}

export interface LibraryPageClientProps {
  ownerId: string;
  initialLibrary: LibraryInitialPage;
  initialTrash: LibraryInitialPage;
}

export default function LibraryPageClient({
  ownerId,
  initialLibrary,
  initialTrash,
}: LibraryPageClientProps) {
  const mainScrollRef = useRef<HTMLElement>(null);
  const previewUpdatesRef = useRef<LibraryPreviewUpdates>({});
  const [images, setImages] = useState<ImageRecord[]>(initialLibrary.images);
  const [trashedImages, setTrashedImages] = useState<ImageRecord[]>(
    initialTrash.images,
  );
  const [libraryTotal, setLibraryTotal] = useState(initialLibrary.total);
  const [trashTotal, setTrashTotal] = useState(initialTrash.total);
  const [libraryPage, setLibraryPage] = useState(1);
  const [trashPage, setTrashPage] = useState(1);
  const [libraryLoadingMore, setLibraryLoadingMore] = useState(false);
  const [trashLoadingMore, setTrashLoadingMore] = useState(false);
  const [searchOverlay, setSearchOverlay] = useState<LibrarySearchOverlay>({
    kind: "none",
  });
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [sidebarView, setSidebarView] = useState<LibrarySidebarView>(
    DEFAULT_LIBRARY_SIDEBAR_VIEW,
  );
  const [albums, setAlbums] = useState<AlbumRecord[]>([]);

  useLayoutEffect(() => {
    const previous = recallLibraryView(ownerId);
    if (!previous) return;
    const library = restoreLibraryPages(previous.images, previous.libraryTotal, previous.libraryPage, initialLibrary);
    const trash = restoreLibraryPages(previous.trashedImages, previous.trashTotal, previous.trashPage, initialTrash);
    setImages(library.images);
    setLibraryTotal(initialLibrary.total);
    setLibraryPage(library.page);
    setTrashedImages(trash.images);
    setTrashTotal(initialTrash.total);
    setTrashPage(trash.page);
    setFilters(previous.filters);
    setSidebarView(previous.sidebarView);
    setAlbums(previous.albums);
    const frame = requestAnimationFrame(() => {
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = previous.scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [ownerId, initialLibrary, initialTrash]);

  useEffect(() => {
    const main = mainScrollRef.current;
    const view = { images, trashedImages, libraryTotal, trashTotal, libraryPage, trashPage,
      filters, sidebarView, albums, scrollTop: main?.scrollTop ?? 0 };
    const remember = () => {
      view.scrollTop = main?.scrollTop ?? 0;
      rememberLibraryView(ownerId, view);
    };
    remember();
    main?.addEventListener("scroll", remember, { passive: true });
    return () => {
      remember();
      main?.removeEventListener("scroll", remember);
    };
  }, [ownerId, images, trashedImages, libraryTotal, trashTotal, libraryPage, trashPage, filters, sidebarView, albums]);

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

  const loadMoreLibrary = useCallback(async () => {
    if (libraryLoadingMore) return;
    if (images.length >= libraryTotal) return;

    const nextPage = libraryPage + 1;
    setLibraryLoadingMore(true);
    try {
      const res = await fetch(buildImagesListUrl(false, nextPage), {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ImagesPageResponse;
      setImages((prev) => mergeImageRecords(prev, applyLibraryPreviewUpdates(data.images, previewUpdatesRef.current)));
      setLibraryTotal(data.total);
      setLibraryPage(data.page);
    } finally {
      setLibraryLoadingMore(false);
    }
  }, [
    images.length,
    libraryLoadingMore,
    libraryPage,
    libraryTotal,
  ]);

  const loadMoreTrash = useCallback(async () => {
    if (trashLoadingMore) return;
    if (trashedImages.length >= trashTotal) return;

    const nextPage = trashPage + 1;
    setTrashLoadingMore(true);
    try {
      const res = await fetch(buildImagesListUrl(true, nextPage), {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ImagesPageResponse;
      setTrashedImages((prev) => mergeImageRecords(prev, applyLibraryPreviewUpdates(data.images, previewUpdatesRef.current)));
      setTrashTotal(data.total);
      setTrashPage(data.page);
    } finally {
      setTrashLoadingMore(false);
    }
  }, [
    trashLoadingMore,
    trashPage,
    trashTotal,
    trashedImages.length,
  ]);

  useLayoutEffect(() => {
    const applyPendingPreviews = () => {
      const pending = consumeLibraryPreviewUpdates();
      if (Object.keys(pending).length === 0) return;
      previewUpdatesRef.current = { ...previewUpdatesRef.current, ...pending };
      setImages((prev) => applyLibraryPreviewUpdates(prev, pending));
      setTrashedImages((prev) => applyLibraryPreviewUpdates(prev, pending));
    };
    applyPendingPreviews();
    window.addEventListener(LIBRARY_PREVIEW_UPDATED_EVENT, applyPendingPreviews);
    return () => window.removeEventListener(LIBRARY_PREVIEW_UPDATED_EVENT, applyPendingPreviews);
  }, []);

  useEffect(() => {
    void fetchAlbums();
  }, [fetchAlbums]);

  useEffect(() => {
    if (sidebarView.kind === "trash") {
      setSearchOverlay({ kind: "none" });
    }
  }, [sidebarView]);

  const handleDeleteImage = useCallback((id: string) => {
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) {
        setLibraryTotal((total) => Math.max(0, total - 1));
        setTrashTotal((total) => total + 1);
        setTrashedImages((trash) => [
          { ...removed, deletedAt: new Date().toISOString() },
          ...trash.filter((img) => img.id !== id),
        ]);
      }
      return prev.filter((img) => img.id !== id);
    });
    setSearchOverlay((prev) =>
      prev.kind === "results"
        ? { ...prev, images: prev.images.filter((img) => img.id !== id) }
        : prev,
    );
  }, []);

  const handleRestoreImage = useCallback((id: string) => {
    setTrashedImages((prev) => {
      const restored = prev.find((img) => img.id === id);
      if (restored) {
        const { deletedAt, ...image } = restored;
        void deletedAt;
        setTrashTotal((total) => Math.max(0, total - 1));
        setLibraryTotal((total) => total + 1);
        setImages((library) => [
          image,
          ...library.filter((img) => img.id !== id),
        ]);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handlePermanentDeleteImage = useCallback((id: string) => {
    setTrashTotal((total) => Math.max(0, total - 1));
    setTrashedImages((prev) => prev.filter((img) => img.id !== id));
    setAlbums((prev) =>
      prev.map((album) => ({
        ...album,
        imageIds: album.imageIds.filter((imageId) => imageId !== id),
      })),
    );
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    try {
      const res = await fetch("/api/trash", { method: "DELETE" });
      const data = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not empty trash.");
        return false;
      }

      const trashedIds = new Set(trashedImages.map((image) => image.id));
      setTrashedImages([]);
      setTrashTotal(0);
      setTrashPage(1);
      setAlbums((prev) =>
        prev.map((album) => ({
          ...album,
          imageIds: album.imageIds.filter((imageId) => !trashedIds.has(imageId)),
        })),
      );
      toast.success(
        `Deleted ${data.deleted ?? 0} photo${data.deleted === 1 ? "" : "s"} permanently`,
      );
      return true;
    } catch {
      toast.error("Could not empty trash.");
      return false;
    }
  }, [trashedImages]);

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

  const handleRenameAlbum = useCallback(async (albumId: string, name: string) => {
    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { album?: Pick<AlbumRecord, "id" | "name">; error?: string };
      if (!res.ok || !data.album) {
        toast.error(data.error ?? "Could not rename album.");
        return false;
      }
      const renamed = data.album;
      setAlbums((prev) => prev.map((album) => album.id === renamed.id ? { ...album, name: renamed.name } : album));
      toast.success("Album renamed");
      return true;
    } catch {
      toast.error("Could not rename album.");
      return false;
    }
  }, []);

  const handleDeleteAlbum = useCallback(
    async (albumId: string) => {
      try {
        const res = await fetch(`/api/albums/${albumId}`, { method: "DELETE" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Could not delete album.");
          return false;
        }

        setAlbums((prev) => prev.filter((album) => album.id !== albumId));
        setSidebarView((prev) =>
          prev.kind === "album" && prev.albumId === albumId
            ? DEFAULT_LIBRARY_SIDEBAR_VIEW
            : prev,
        );
        toast.success("Album deleted");
        return true;
      } catch {
        toast.error("Could not delete album.");
        return false;
      }
    },
    [],
  );

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

  const isTrashView = sidebarView.kind === "trash";
  const handleUploadComplete = useCallback((image: ImageRecord) => {
    setImages((previous) => mergeImageRecords([image], previous));
    setLibraryTotal((previous) => previous + 1);
  }, []);
  const upload = useImageUpload(handleUploadComplete);
  const isSearchActive = searchOverlay.kind !== "none";

  const libraryHasMore = images.length < libraryTotal;
  const trashHasMore = trashedImages.length < trashTotal;

  const loadMoreSentinelRef = useInfiniteScrollSentinel({
    rootRef: mainScrollRef,
    enabled: !isSearchActive,
    hasMore: isTrashView ? trashHasMore : libraryHasMore,
    loading: isTrashView ? trashLoadingMore : libraryLoadingMore,
    onLoadMore: isTrashView ? loadMoreTrash : loadMoreLibrary,
  });

  const filteredImages = useMemo(() => {
    if (isTrashView) {
      return applyLibraryFilters(trashedImages, filters);
    }
    return applyLibraryViewAndFilters(images, sidebarView, albums, filters);
  }, [isTrashView, trashedImages, images, sidebarView, albums, filters]);

  const groups = isTrashView
    ? groupImagesByDeletedMonth(filteredImages)
    : groupImagesByMonth(filteredImages);

  const searchForGrid =
    isTrashView || searchOverlay.kind === "none"
      ? null
      : {
          loading: searchOverlay.kind === "loading",
          images:
            searchOverlay.kind === "results"
              ? applyLibraryViewAndFilters(
                  enrichSearchResultsWithFavorites(
                    searchOverlay.images,
                    images,
                  ),
                  sidebarView,
                  albums,
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
    if (isTrashView) {
      return filtersActive
        ? "No trashed photos match your filters"
        : "Trash is empty";
    }
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
    <div
      className="flex h-screen bg-[#161616] overflow-hidden"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = upload.isBusy ? "none" : "copy";
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        void upload.uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <LibrarySidebar
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        albums={albums}
        onCreateAlbum={handleCreateAlbum}
        onRenameAlbum={handleRenameAlbum}
        onDeleteAlbum={handleDeleteAlbum}
      />
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-[#161616]">
        <main
          ref={mainScrollRef}
          className="scroll-stable flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        >
          {!isTrashView && (
            <LibraryHeader
              upload={upload}
              isSearching={isSearching}
              onSearchStart={handleSearchStart}
              onSearchSuccess={handleSearchSuccess}
              onSearchAbort={handleSearchAbort}
              onSearchClear={handleSearchClear}
              filters={filters}
              onFiltersChange={setFilters}
            />
          )}
          {isTrashView && (
            <TrashViewToolbar
              count={trashTotal}
              onEmptyTrash={handleEmptyTrash}
            />
          )}
          <PhotoGrid
            groups={groups}
            viewMode={isTrashView ? "trash" : "library"}
            search={searchForGrid}
            albums={albums}
            albumMembershipByImageId={albumMembershipByImageId}
            onDeleteImage={handleDeleteImage}
            onFavoriteToggle={handleFavoriteToggle}
            onAlbumMembershipChange={handleAlbumMembershipChange}
            onRestoreImage={handleRestoreImage}
            onPermanentDeleteImage={handlePermanentDeleteImage}
            libraryEmptyMessage={getLibraryEmptyMessage()}
            searchEmptyMessage={getSearchEmptyMessage()}
            loadMoreSentinelRef={isSearchActive ? undefined : loadMoreSentinelRef}
            loadingMore={isTrashView ? trashLoadingMore : libraryLoadingMore}
            hasMore={isTrashView ? trashHasMore : libraryHasMore}
          />
        </main>
      </div>
    </div>
  );
}
