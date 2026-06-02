"use client";

import type { ImageGroup, ImageRecord } from "@/types/image";
import PhotoCard from "./PhotoCard";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";
import { motion, useReducedMotion } from "framer-motion";

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

function AnimatedPhotoGrid({
  images,
  onDeleteImage,
}: {
  images: ImageRecord[];
  onDeleteImage?: (id: string) => void;
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
          <PhotoCard image={image} onDelete={onDeleteImage} />
        </motion.div>
      ))}
    </motion.div>
  );
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
        <AnimatedPhotoGrid images={search.images} onDeleteImage={onDeleteImage} />
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
            <AnimatedPhotoGrid images={group.images} onDeleteImage={onDeleteImage} />
          </div>
        ),
      )}
    </div>
  );
}
