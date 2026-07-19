import type { IconName } from "@/components/shared/Icon";
import type { LibraryQuickFilter, LibrarySidebarView } from "@/lib/library-filters";

export interface LibraryQuickFilterOption {
  id: LibraryQuickFilter;
  label: string;
  icon: IconName;
}

export const LIBRARY_QUICK_FILTER_OPTIONS: LibraryQuickFilterOption[] = [
  { id: "all", label: "All Photos", icon: "Grid01" },
  { id: "recent", label: "Recently Added", icon: "Clock" },
  { id: "favorites", label: "Favorites", icon: "Heart" },
];

export const DEFAULT_LIBRARY_SIDEBAR_VIEW: LibrarySidebarView = {
  kind: "quick",
  filter: "all",
};
