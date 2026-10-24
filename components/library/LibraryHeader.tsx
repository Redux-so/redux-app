"use client";

import { useUser } from "@clerk/nextjs";
import { useIsClient } from "@/hooks/useIsClient";
import type { ImageUploadState } from "@/hooks/useImageUpload";

import SearchBar from "@/components/library/SearchBar";
import UploadDropzone from "@/components/library/UploadDropzone";
import type { LibraryFilters } from "@/lib/library-filters";
import type { ImageRecord } from "@/types/image";

interface LibraryHeaderProps {
  upload: ImageUploadState;
  isSearching: boolean;
  onSearchStart: () => void;
  onSearchSuccess: (images: ImageRecord[]) => void;
  onSearchAbort: () => void;
  onSearchClear: () => void;
  filters: LibraryFilters;
  onFiltersChange: (filters: LibraryFilters) => void;
}

function getTimeGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function LibraryHeader({
  upload,
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
  filters,
  onFiltersChange,
}: LibraryHeaderProps) {
  const { user } = useUser();
  const isClient = useIsClient();

  const firstName = isClient
    ? user?.firstName?.trim() || "there"
    : "there";
  const greeting = isClient
    ? getTimeGreeting(new Date().getHours())
    : "Welcome";

  return (
    <header className="flex shrink-0 flex-col gap-5 px-6 pt-4 lg:pt-8 pb-8">
      <div className="accent-glow-heading-zone">
        <h1 className="relative z-[1] text-center text-[32px] font-medium leading-tight tracking-tight text-white sm:text-[36px]">
          {greeting}, {firstName}
        </h1>
      </div>

      <SearchBar
        variant="large"
        isSearching={isSearching}
        onSearchStart={onSearchStart}
        onSearchSuccess={onSearchSuccess}
        onSearchAbort={onSearchAbort}
        onSearchClear={onSearchClear}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />

      <UploadDropzone upload={upload} />
    </header>
  );
}
