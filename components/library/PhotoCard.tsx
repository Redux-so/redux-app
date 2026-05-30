"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { ImageRecord } from "@/types/image";

interface PhotoCardProps {
  image: ImageRecord;
  onDelete?: (id: string) => void;
}

export default function PhotoCard({ image, onDelete }: PhotoCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

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
      className="group relative w-full aspect-square bg-white/[0.03] rounded-2xl overflow-hidden cursor-pointer"
    >
      <Image
        src={image.previewUrl ?? image.originalUrl}
        alt={image.filename}
        fill
        sizes="(max-width: 768px) 50vw, 20vw"
        className="object-cover"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2.5">
        <button
          onClick={handleEdit}
          className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.15] bg-white/[0.12] px-4 text-[13px] font-medium text-white backdrop-blur-sm hover:bg-white/[0.2] transition-all cursor-pointer"
        >
          <Pencil size={15} strokeWidth={2} />
          Edit
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-9 items-center gap-2 rounded-lg border border-red-500/20 bg-black/40 px-4 text-[13px] font-medium text-[#ef4444] backdrop-blur-sm hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
        >
          <Trash2 size={15} strokeWidth={2} />
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
