import type { ImageRecord } from "@/types/image";
import type { AlbumRecord } from "@/types/album";
import type { LibraryFilters, LibrarySidebarView } from "@/lib/library-filters";

export interface LibraryViewSnapshot {
  images: ImageRecord[];
  trashedImages: ImageRecord[];
  libraryTotal: number;
  trashTotal: number;
  libraryPage: number;
  trashPage: number;
  filters: LibraryFilters;
  sidebarView: LibrarySidebarView;
  albums: AlbumRecord[];
  scrollTop: number;
}

// One account, one tab, five minutes. Never write private library data to disk.
let cached: { ownerId: string; savedAt: number; view: LibraryViewSnapshot } | null = null;

export function rememberLibraryView(ownerId: string, view: LibraryViewSnapshot): void {
  if (typeof window === "undefined") return;
  // Avoid retaining an unbounded infinite-scroll list.
  cached = view.images.length + view.trashedImages.length <= 1000
    ? { ownerId, savedAt: Date.now(), view } : null;
}

export function recallLibraryView(ownerId: string): LibraryViewSnapshot | null {
  if (typeof window === "undefined" || cached?.ownerId !== ownerId) return null;
  if (Date.now() - cached.savedAt > 5 * 60_000) { cached = null; return null; }
  return cached.view;
}

/** Fresh server data wins; retain later pages only if the first page and count agree. */
export function restoreLibraryPages(
  previous: ImageRecord[], previousTotal: number, previousPage: number,
  fresh: { images: ImageRecord[]; total: number },
): { images: ImageRecord[]; page: number } {
  const sameList = previousTotal === fresh.total && fresh.images.every((image, index) => previous[index]?.id === image.id);
  return sameList
    ? { images: [...fresh.images, ...previous.slice(fresh.images.length)], page: previousPage }
    : { images: fresh.images, page: 1 };
}
