"use client";

import Link from "next/link";

import UploadButton from "@/components/library/UploadButton";
import AppChromeLogo from "@/components/shared/AppChromeLogo";
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
    <header className="h-[52px] bg-[#0a0a0a] border-b border-[#2a2a2a] flex items-center gap-3 shrink-0 pl-3 pr-3">
      <div className="flex h-[52px] shrink-0 items-center">
        <Link
          href="/library"
          className="inline-flex items-center no-underline transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80"
        >
          <AppChromeLogo />
        </Link>
      </div>

      <div className="w-px h-[18px] bg-[#2a2a2a] shrink-0" />

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
