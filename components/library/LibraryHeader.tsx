"use client";

import { useUser } from "@clerk/nextjs";

import SearchBar from "@/components/library/SearchBar";
import UploadDropzone from "@/components/library/UploadDropzone";
import type { LibraryFilters } from "@/lib/library-filters";
import type { ImageRecord } from "@/types/image";

interface LibraryHeaderProps {
  onUploadComplete?: () => void;
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
  onUploadComplete,
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
  filters,
  onFiltersChange,
}: LibraryHeaderProps) {
  const { user } = useUser();
  const firstName = user?.firstName?.trim() || "there";
  const greeting = getTimeGreeting(new Date().getHours());

  return (
    <header className="flex shrink-0 flex-col gap-5 px-6 pt-8 pb-8">
      <h1 className="text-center text-[32px] font-bold leading-tight tracking-tight text-white sm:text-[36px]">
        {greeting}, {firstName}
      </h1>

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

      <UploadDropzone onUploadComplete={onUploadComplete} />
    </header>
  );
}
