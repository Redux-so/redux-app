"use client";

import { appPath } from "@/lib/app-path";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

import { useState } from "react";
import Image from "next/image";
import { usePhotoCardControls } from "@/hooks/usePhotoCardControls";
import { Icon } from "@/components/shared/Icon";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import type { ImageRecord } from "@/types/image";
import { cloudinaryThumbnailUrl } from "@/lib/cloudinary-url";
import toast from "react-hot-toast";

const OVERLAY_ACTION =
  "pointer-events-auto flex shrink-0 cursor-pointer items-center justify-center rounded-md border backdrop-blur-sm transition-all";

interface TrashPhotoCardProps {
  image: ImageRecord;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
}

export default function TrashPhotoCard({
  image,
  onRestore,
  onPermanentDelete,
}: TrashPhotoCardProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const cardControls = usePhotoCardControls(image.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleRestore(e: React.MouseEvent) {
    e.stopPropagation();
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const res = await fetch(appPath(`/api/images/${image.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) {
        toast.error("Could not restore photo.");
        return;
      }
      onRestore?.(image.id);
      toast.success("Photo restored");
    } catch {
      toast.error("Could not restore photo.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handlePermanentDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(appPath(`/api/images/${image.id}`), { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete photo permanently.");
        return;
      }
      setConfirmOpen(false);
      onPermanentDelete?.(image.id);
      toast.success("Photo deleted permanently");
    } catch {
      toast.error("Could not delete photo permanently.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div {...cardControls} className="photo-card @container group relative aspect-square w-full min-w-0 overflow-hidden rounded-xl bg-white/[0.03]">
        <Image
          key={`${image.id}:${image.previewUrl ?? image.originalUrl}`}
          src={cloudinaryThumbnailUrl(image.previewUrl ?? image.originalUrl)}
          alt={image.filename}
          fill
          sizes="(max-width: 768px) 50vw, 20vw"
          className="object-cover opacity-80"
          loading="lazy"
        />

        <div {...cardControls} className="photo-card-actions pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={handleRestore}
            disabled={isRestoring}
            aria-label={isRestoring ? "Restoring photo" : "Restore photo"}
            className={`${OVERLAY_ACTION} h-8 w-8 gap-0 border-white/[0.12] bg-white/[0.12] text-white hover:bg-white/[0.2] disabled:cursor-not-allowed disabled:opacity-50 @[11rem]:h-9 @[11rem]:w-auto @[11rem]:gap-1.5 @[11rem]:px-3`}
          >
            {isRestoring ? <LoadingSpinner size="xs" label="Restoring photo" /> : (
              <>
                <Icon name="FlipBackward" size={16} className="shrink-0" aria-hidden />
                <span className="hidden text-[13px] font-medium @[11rem]:inline">Restore</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            disabled={isDeleting}
            aria-label="Delete photo permanently"
            className={`${OVERLAY_ACTION} h-8 w-8 gap-0 border-red-500/20 bg-black/40 text-[#ef4444] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 @[11rem]:h-9 @[11rem]:w-auto @[11rem]:gap-1.5 @[11rem]:px-3`}
          >
            <Icon name="Trash04" size={16} className="shrink-0" aria-hidden />
            <span className="hidden text-[13px] font-medium @[11rem]:inline">
              Delete
            </span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete photo permanently?"
        body="This removes the photo from Redux. This action cannot be undone."
        confirmLabel="Delete Permanently"
        destructive
        loading={isDeleting}
        onConfirm={() => void handlePermanentDelete()}
        onCancel={() => {
          if (!isDeleting) setConfirmOpen(false);
        }}
      />
    </>
  );
}
