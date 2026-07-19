import {
  LIBRARY_FILE_TYPE_EXTENSIONS,
  type LibraryFileTypeKey,
} from "@/constants/image-formats";
import {
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
  type AdjustmentKey,
} from "@/constants/adjustments";
import type { ImageRecord } from "@/types/image";
import type { AlbumRecord } from "@/types/album";

export type DateFilterPreset =
  | "anytime"
  | "today"
  | "last7"
  | "last30"
  | "custom";

export type EditStatusFilter = "all" | "edited" | "unedited";

export type OrientationFilter = "landscape" | "portrait" | "square";

export interface LibraryFilters {
  datePreset: DateFilterPreset;
  customStartDate: string;
  customEndDate: string;
  editStatus: EditStatusFilter;
  fileTypes: LibraryFileTypeKey[];
  orientations: OrientationFilter[];
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  datePreset: "anytime",
  customStartDate: "",
  customEndDate: "",
  editStatus: "all",
  fileTypes: [],
  orientations: [],
};

export function hasNonDefaultAdjustments(adjustments: unknown): boolean {
  if (!adjustments || typeof adjustments !== "object") return false;
  const normalized = normalizeAdjustments(
    adjustments as Partial<Record<string, number>>,
  );
  return (Object.keys(DEFAULT_ADJUSTMENTS) as AdjustmentKey[]).some(
    (key) => normalized[key] !== DEFAULT_ADJUSTMENTS[key],
  );
}

export function countActiveLibraryFilters(filters: LibraryFilters): number {
  let count = 0;
  if (filters.datePreset !== "anytime") count += 1;
  if (filters.editStatus !== "all") count += 1;
  if (filters.fileTypes.length > 0) count += 1;
  if (filters.orientations.length > 0) count += 1;
  return count;
}

function resolveDateRange(filters: LibraryFilters): {
  start: Date | null;
  end: Date | null;
} {
  const now = new Date();

  switch (filters.datePreset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    case "last7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end: now };
    }
    case "last30": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { start, end: now };
    }
    case "custom": {
      if (!filters.customStartDate && !filters.customEndDate) {
        return { start: null, end: null };
      }
      const start = filters.customStartDate
        ? new Date(`${filters.customStartDate}T00:00:00`)
        : null;
      const end = filters.customEndDate
        ? new Date(`${filters.customEndDate}T23:59:59.999`)
        : now;
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
}

function getImageExtension(image: ImageRecord): string {
  const fromFormat = image.format?.toLowerCase().replace(/^\./, "");
  if (fromFormat) return fromFormat;
  const match = image.filename.match(/\.([^.]+)$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function matchesFileType(
  image: ImageRecord,
  selected: LibraryFileTypeKey[],
): boolean {
  if (selected.length === 0) return true;
  const ext = getImageExtension(image);
  return selected.some((type) =>
    (LIBRARY_FILE_TYPE_EXTENSIONS[type] as readonly string[]).includes(ext),
  );
}

function getOrientation(
  width: number,
  height: number,
): OrientationFilter {
  const max = Math.max(width, height);
  const tolerance = max * 0.01;
  if (Math.abs(width - height) <= tolerance) return "square";
  return width > height ? "landscape" : "portrait";
}

function matchesOrientation(
  image: ImageRecord,
  selected: OrientationFilter[],
): boolean {
  if (selected.length === 0) return true;
  const orientation = getOrientation(image.width, image.height);
  return selected.includes(orientation);
}

function matchesEditStatus(
  image: ImageRecord,
  editStatus: EditStatusFilter,
): boolean {
  if (editStatus === "all") return true;
  const edited = image.isEdited === true;
  return editStatus === "edited" ? edited : !edited;
}

function matchesDate(image: ImageRecord, filters: LibraryFilters): boolean {
  if (filters.datePreset === "anytime") return true;
  const { start, end } = resolveDateRange(filters);
  if (!start && !end) return true;

  const created = new Date(image.createdAt);
  if (start && created < start) return false;
  if (end && created > end) return false;
  return true;
}

export function applyLibraryFilters(
  images: ImageRecord[],
  filters: LibraryFilters,
): ImageRecord[] {
  return images.filter(
    (image) =>
      matchesDate(image, filters) &&
      matchesEditStatus(image, filters.editStatus) &&
      matchesFileType(image, filters.fileTypes) &&
      matchesOrientation(image, filters.orientations),
  );
}

export type LibraryQuickFilter = "all" | "recent" | "favorites";

/** Mutually exclusive sidebar destinations — never combine with each other. */
export type LibrarySidebarView =
  | { kind: "quick"; filter: LibraryQuickFilter }
  | { kind: "album"; albumId: string }
  | { kind: "trash" };

/** Reuses the same date window as the filter popover's "Last 7 days" preset. */
export function isImageWithinDatePreset(
  image: ImageRecord,
  preset: DateFilterPreset,
): boolean {
  if (preset === "anytime") return true;
  return matchesDate(image, {
    ...DEFAULT_LIBRARY_FILTERS,
    datePreset: preset,
  });
}

export function applyLibraryQuickFilter(
  images: ImageRecord[],
  quickFilter: LibraryQuickFilter,
): ImageRecord[] {
  switch (quickFilter) {
    case "recent":
      return images.filter((image) => isImageWithinDatePreset(image, "last7"));
    case "favorites":
      return images.filter((image) => image.isFavorite === true);
    default:
      return images;
  }
}

/** Applies exactly one sidebar view — quick filter OR album, never both. */
export function applyLibrarySidebarView(
  images: ImageRecord[],
  view: LibrarySidebarView,
  albums: AlbumRecord[],
): ImageRecord[] {
  if (view.kind === "trash") {
    return [];
  }

  if (view.kind === "album") {
    const album = albums.find((entry) => entry.id === view.albumId);
    if (!album) return [];
    const memberIds = new Set(album.imageIds);
    return images.filter((image) => memberIds.has(image.id));
  }

  return applyLibraryQuickFilter(images, view.filter);
}
