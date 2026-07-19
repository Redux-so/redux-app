"use client";

import type { AlbumRecord } from "@/types/album";
import type { ImageGroup, ImageRecord } from "@/types/image";
import PhotoCard from "./PhotoCard";
import TrashPhotoCard from "./TrashPhotoCard";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";
import { motion, useReducedMotion } from "framer-motion";

interface PhotoGridProps {
  groups: ImageGroup[];
  libraryLoading?: boolean;
  viewMode?: "library" | "trash";
  /** When set, show semantic search results instead of date groups. */
  search?: {
    loading: boolean;
    images: ImageRecord[];
  } | null;
  onDeleteImage?: (id: string) => void;
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void;
  onAlbumMembershipChange?: (
    albumId: string,
    imageId: string,
    isMember: boolean,
  ) => void;
  onRestoreImage?: (id: string) => void;
  onPermanentDeleteImage?: (id: string) => void;
  albums?: AlbumRecord[];
  albumMembershipByImageId?: Map<string, Set<string>>;
  libraryEmptyMessage?: string;
  searchEmptyMessage?: string;
}

function AnimatedPhotoGrid({
  images,
  viewMode,
  albums,
  albumMembershipByImageId,
  onDeleteImage,
  onFavoriteToggle,
  onAlbumMembershipChange,
  onRestoreImage,
  onPermanentDeleteImage,
}: {
  images: ImageRecord[];
  viewMode: "library" | "trash";
  albums: AlbumRecord[];
  albumMembershipByImageId: Map<string, Set<string>>;
  onDeleteImage?: (id: string) => void;
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void;
  onAlbumMembershipChange?: (
    albumId: string,
    imageId: string,
    isMember: boolean,
  ) => void;
  onRestoreImage?: (id: string) => void;
  onPermanentDeleteImage?: (id: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.25;
  const stagger = prefersReducedMotion ? 0 : 0.035;

  return (
    <motion.div
      className="grid grid-cols-5 gap-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {images.map((image) => (
        <motion.div
          key={image.id}
          variants={{
            hidden: {
              opacity: prefersReducedMotion ? 1 : 0,
              y: prefersReducedMotion ? 0 : 8,
            },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration, ease: "easeOut" },
            },
          }}
        >
          {viewMode === "trash" ? (
            <TrashPhotoCard
              image={image}
              onRestore={onRestoreImage}
              onPermanentDelete={onPermanentDeleteImage}
            />
          ) : (
            <PhotoCard
              image={image}
              albums={albums}
              memberAlbumIds={
                albumMembershipByImageId.get(image.id) ?? new Set<string>()
              }
              onDelete={onDeleteImage}
              onFavoriteToggle={onFavoriteToggle}
              onAlbumMembershipChange={onAlbumMembershipChange}
            />
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

export default function PhotoGrid({
  groups,
  libraryLoading,
  viewMode = "library",
  search,
  onDeleteImage,
  onFavoriteToggle,
  onAlbumMembershipChange,
  onRestoreImage,
  onPermanentDeleteImage,
  albums = [],
  albumMembershipByImageId = new Map(),
  libraryEmptyMessage = "Upload your first photo",
  searchEmptyMessage = "No photos found matching your search",
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
            {searchEmptyMessage}
          </p>
        </div>
      );
    }
    return (
      <div className="px-6 py-5 flex flex-col gap-5">
        <AnimatedPhotoGrid
          images={search.images}
          viewMode={viewMode}
          albums={albums}
          albumMembershipByImageId={albumMembershipByImageId}
          onDeleteImage={onDeleteImage}
          onFavoriteToggle={onFavoriteToggle}
          onAlbumMembershipChange={onAlbumMembershipChange}
          onRestoreImage={onRestoreImage}
          onPermanentDeleteImage={onPermanentDeleteImage}
        />
      </div>
    );
  }

  if (libraryLoading) {
    return (
      <LoadingOverlay
        className="h-full min-h-[240px] w-full"
        message={viewMode === "trash" ? "Loading trash" : "Loading library"}
        size="md"
      />
    );
  }

  const hasImages = groups.some((g) => g.images.length > 0);

  if (!hasImages) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-[#555555] text-[13px]">{libraryEmptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 flex flex-col gap-5">
      {groups.map((group) =>
        group.images.length === 0 ? null : (
          <div key={group.label}>
            <p className="text-[12px] font-semibold text-[#888888] mb-3">
              {group.label}
            </p>
            <AnimatedPhotoGrid
              images={group.images}
              viewMode={viewMode}
              albums={albums}
              albumMembershipByImageId={albumMembershipByImageId}
              onDeleteImage={onDeleteImage}
              onFavoriteToggle={onFavoriteToggle}
              onAlbumMembershipChange={onAlbumMembershipChange}
              onRestoreImage={onRestoreImage}
              onPermanentDeleteImage={onPermanentDeleteImage}
            />
          </div>
        ),
      )}
    </div>
  );
}
