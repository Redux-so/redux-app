"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/shared/Icon";
import PhotoCardAlbumMenu from "@/components/library/PhotoCardAlbumMenu";
import type { AlbumRecord } from "@/types/album";
import type { ImageRecord } from "@/types/image";
import { cloudinaryThumbnailUrl } from "@/lib/cloudinary-url";

const OVERLAY_ACTION =
  "pointer-events-auto flex shrink-0 cursor-pointer items-center justify-center rounded-md border backdrop-blur-sm transition-all";

interface PhotoCardProps {
  image: ImageRecord;
  albums: AlbumRecord[];
  memberAlbumIds: Set<string>;
  onDelete?: (id: string) => void;
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void;
  onAddedToAlbum?: (albumId: string, imageId: string) => void;
}

export default function PhotoCard({
  image,
  albums,
  memberAlbumIds,
  onDelete,
  onFavoriteToggle,
  onAddedToAlbum,
}: PhotoCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(image.isFavorite === true);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  useEffect(() => {
    setIsFavorite(image.isFavorite === true);
  }, [image.id, image.isFavorite]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id }),
      });
      if (res.ok) {
        onDelete?.(image.id);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleFavoriteToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTogglingFavorite) return;

    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);
    setIsTogglingFavorite(true);

    try {
      const res = await fetch(`/api/images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: nextFavorite }),
      });

      if (!res.ok) {
        setIsFavorite(!nextFavorite);
        return;
      }

      onFavoriteToggle?.(image.id, nextFavorite);
    } catch {
      setIsFavorite(!nextFavorite);
    } finally {
      setIsTogglingFavorite(false);
    }
  }

  function navigateToEditor() {
    router.push(`/editor?imageId=${image.id}`);
  }

  function handleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    navigateToEditor();
  }

  return (
    <div
      onClick={navigateToEditor}
      className="@container group relative aspect-square w-full min-w-0 cursor-pointer overflow-hidden rounded-xl bg-white/[0.03]"
    >
      <Image
        src={cloudinaryThumbnailUrl(image.previewUrl ?? image.originalUrl)}
        alt={image.filename}
        fill
        sizes="(max-width: 768px) 50vw, 20vw"
        className="object-cover"
        loading="lazy"
      />

      <PhotoCardAlbumMenu
        imageId={image.id}
        albums={albums}
        memberAlbumIds={memberAlbumIds}
        onAddedToAlbum={(albumId, imageId) => onAddedToAlbum?.(albumId, imageId)}
      />

      <button
        type="button"
        onClick={handleFavoriteToggle}
        disabled={isTogglingFavorite}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
        className={[
          "pointer-events-auto absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border backdrop-blur-sm transition-all",
          isFavorite
            ? "border-[#ef4444]/30 bg-black/50 text-[#ef4444] opacity-100"
            : "border-white/[0.12] bg-black/40 text-[#888888] opacity-0 hover:text-white group-hover:opacity-100",
          isTogglingFavorite ? "cursor-wait opacity-70" : "cursor-pointer",
        ].join(" ")}
      >
        <Icon
          name="Heart"
          size={16}
          className={isFavorite ? "fill-[#ef4444]" : ""}
          aria-hidden
        />
      </button>

      <div className="pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center gap-1.5 overflow-hidden bg-gradient-to-t from-black/70 via-black/25 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleEdit}
          aria-label="Edit photo"
          className={`${OVERLAY_ACTION} h-8 w-8 gap-0 border-white/[0.15] bg-white/[0.12] hover:bg-white/[0.2] @[11rem]:h-9 @[11rem]:w-auto @[11rem]:gap-2 @[11rem]:px-4`}
        >
          <Icon name="Edit01" size={16} aria-hidden />
          <span className="hidden text-[13px] font-medium text-white @[11rem]:inline">
            Edit
          </span>
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={isDeleting ? "Deleting photo" : "Delete photo"}
          className={`${OVERLAY_ACTION} h-8 w-8 gap-0 border-red-500/20 bg-black/40 text-[#ef4444] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 @[11rem]:h-9 @[11rem]:w-auto @[11rem]:gap-2 @[11rem]:px-4`}
        >
          <Icon name="Trash04" size={16} aria-hidden />
          <span className="hidden text-[13px] font-medium @[11rem]:inline">
            {isDeleting ? "Deleting..." : "Delete"}
          </span>
        </button>
      </div>
    </div>
  );
}
