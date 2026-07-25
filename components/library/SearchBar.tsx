"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import LibraryFiltersPopover from "@/components/library/LibraryFiltersPopover";
import {
  countActiveLibraryFilters,
  DEFAULT_LIBRARY_FILTERS,
  type LibraryFilters,
} from "@/lib/library-filters";
import toast from "react-hot-toast";
import type { ImageRecord } from "@/types/image";

interface SearchBarProps {
  isSearching: boolean;
  onSearchStart: () => void;
  onSearchSuccess: (images: ImageRecord[]) => void;
  /** End loading / exit search overlay on error, 402, or network failure (not on success). */
  onSearchAbort: () => void;
  onSearchClear: () => void;
  variant?: "default" | "large";
  filters: LibraryFilters;
  onFiltersChange: (filters: LibraryFilters) => void;
}

export default function SearchBar({
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
  variant = "default",
  filters,
  onFiltersChange,
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<LibraryFilters>(filters);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (filtersOpen) {
      setDraftFilters(filters);
    }
  }, [filtersOpen, filters]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      onSearchClear();
      return;
    }

    onSearchStart();
    try {
      const res = await fetch(
        `/api/ai/search?query=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      if (res.status === 402) {
        toast.error("Insufficient credits");
        onSearchAbort();
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "Search failed");
        onSearchAbort();
        return;
      }
      const data = (await res.json()) as { images?: unknown };
      const raw = data.images;
      const images = Array.isArray(raw)
        ? (raw as ImageRecord[]).filter(
            (img) =>
              img &&
              typeof img.id === "string" &&
              typeof img.originalUrl === "string",
          )
        : [];
      onSearchSuccess(images);
    } catch {
      toast.error("Search failed");
      onSearchAbort();
    }
  }

  function handleChange(next: string) {
    setValue(next);
    if (next === "") {
      onSearchClear();
    }
  }

  function handleCloseFilters() {
    setDraftFilters(filters);
    setFiltersOpen(false);
  }

  function handleApplyFilters() {
    onFiltersChange(draftFilters);
    setFiltersOpen(false);
  }

  function handleClearAllFilters() {
    onFiltersChange(DEFAULT_LIBRARY_FILTERS);
    setDraftFilters(DEFAULT_LIBRARY_FILTERS);
    setFiltersOpen(false);
  }

  const isLarge = variant === "large";
  const activeFilterCount = countActiveLibraryFilters(filters);
  const hasActiveFilters = activeFilterCount > 0;
  const iconSize = isLarge ? 20 : 16;
  const iconStrokeWidth = 1.5;

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <form
        onSubmit={handleSubmit}
        className={[
          "relative flex w-full items-center border bg-[#1d1d1d] transition-colors focus-within:border-[#3a3a3a]",
          isLarge
            ? "h-[52px] rounded-xl border-[#2e2e2e] pl-12 pr-2"
            : "h-[38px] rounded-lg border-[#2e2e2e] pl-9 pr-1.5",
        ].join(" ")}
      >
        <Icon
          name="SearchMd"
          size={iconSize}
          strokeWidth={iconStrokeWidth}
          className={[
            "absolute top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none",
            isLarge ? "left-4" : "left-3",
          ].join(" ")}
          aria-hidden
        />
        {isSearching ? (
          <LoadingSpinner
            size="xs"
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none right-14"
            label="Searching"
          />
        ) : null}
        <input
          type="search"
          name="library-search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by keyword, color, scene, mood..."
          disabled={isSearching}
          className={[
            "min-w-0 flex-1 bg-transparent text-white placeholder:text-[#888888] outline-none disabled:opacity-60",
            isLarge ? "pr-2 text-[16px] placeholder:text-[14px]" : "pr-1 text-[14px] placeholder:text-[13px]",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-label="Filter photos"
          aria-expanded={filtersOpen}
          className={[
            "relative flex shrink-0 items-center justify-center transition-colors cursor-pointer",
            isLarge ? "h-10 w-10" : "h-9 w-9",
            hasActiveFilters
              ? "text-[#B07EF0]"
              : "text-[#888888] hover:text-white",
          ].join(" ")}
        >
          <Icon
            name="FilterFunnel02"
            size={iconSize}
            strokeWidth={iconStrokeWidth}
            aria-hidden
          />
          {hasActiveFilters && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8758ed] px-1 text-[10px] font-semibold leading-none text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </form>

      <LibraryFiltersPopover
        open={filtersOpen}
        containerRef={containerRef}
        draft={draftFilters}
        applied={filters}
        onDraftChange={setDraftFilters}
        onApply={handleApplyFilters}
        onClearAll={handleClearAllFilters}
        onClose={handleCloseFilters}
      />
    </div>
  );
}
