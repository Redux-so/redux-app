"use client";

import UploadButton from "@/components/library/UploadButton";
import SearchBar from "@/components/library/SearchBar";
import type { ImageRecord } from "@/types/image";

interface HeaderProps {
  onUploadComplete?: () => void;
  isSearching: boolean;
  onSearchStart: () => void;
  onSearchSuccess: (images: ImageRecord[]) => void;
  onSearchAbort: () => void;
  onSearchClear: () => void;
}

export default function Header({
  onUploadComplete,
  isSearching,
  onSearchStart,
  onSearchSuccess,
  onSearchAbort,
  onSearchClear,
}: HeaderProps) {
  return (
    <header className="bg-black/40 backdrop-blur-2xl border-b border-white/[0.08] flex items-center gap-3 shrink-0 pl-3 pr-3 py-4">
      <SearchBar
        isSearching={isSearching}
        onSearchStart={onSearchStart}
        onSearchSuccess={onSearchSuccess}
        onSearchAbort={onSearchAbort}
        onSearchClear={onSearchClear}
      />

      <UploadButton onUploadComplete={onUploadComplete} />
    </header>
  );
}
