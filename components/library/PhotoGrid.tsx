"use client";

import type { ImageGroup, ImageRecord } from "@/types/image";
import PhotoCard from "./PhotoCard";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";

interface PhotoGridProps {
  groups: ImageGroup[];
  libraryLoading?: boolean;
  /** When set, show semantic search results instead of date groups. */
  search?: {
    loading: boolean;
    images: ImageRecord[];
  } | null;
  onDeleteImage?: (id: string) => void;
}

export default function PhotoGrid({
  groups,
  libraryLoading,
  search,
  onDeleteImage,
}: PhotoGridProps) {
  if (search) {
    if (search.loading) {
      return (
        <LoadingOverlay
          className="h-full min-h-[240px] w-full"
          message="Searching photos"
          size="md"
        />
      );
    }
    if (search.images.length === 0) {
      return (
        <div className="flex items-center justify-center h-full w-full px-5">
          <p className="text-[#555555] text-[13px] text-center">
            No photos found matching your search
          </p>
        </div>
      );
    }
    return (
      <div className="px-6 py-5 flex flex-col gap-5">
        <div className="grid grid-cols-5 gap-3">
          {search.images.map((image) => (
            <PhotoCard key={image.id} image={image} onDelete={onDeleteImage} />
          ))}
        </div>
      </div>
    );
  }

  if (libraryLoading) {
    return (
      <LoadingOverlay
        className="h-full min-h-[240px] w-full"
        message="Loading library"
        size="md"
      />
    );
  }

  const hasImages = groups.some((g) => g.images.length > 0);

  if (!hasImages) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-[#555555] text-[13px]">Upload your first photo</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">
      {groups.map((group) =>
        group.images.length === 0 ? null : (
          <div key={group.label}>
            <p className="text-[11px] text-[#555555] uppercase tracking-[0.14em] font-medium mb-3">
              {group.label}
            </p>
            <div className="grid grid-cols-5 gap-3">
              {group.images.map((image) => (
                <PhotoCard key={image.id} image={image} onDelete={onDeleteImage} />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
