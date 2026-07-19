"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import toast from "react-hot-toast";

interface TrashViewToolbarProps {
  count: number;
  onEmptyTrash: () => Promise<boolean>;
}

export default function TrashViewToolbar({
  count,
  onEmptyTrash,
}: TrashViewToolbarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);

  async function handleConfirmEmpty() {
    if (emptying) return;
    setEmptying(true);
    try {
      const ok = await onEmptyTrash();
      if (ok) setConfirmOpen(false);
    } finally {
      setEmptying(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-6 pt-8 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Trash</h2>
          <p className="text-[13px] text-[#888888] mt-0.5">
            {count === 0
              ? "Deleted photos appear here"
              : `${count} photo${count === 1 ? "" : "s"} in trash`}
          </p>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="shrink-0 h-9 px-4 text-[13px] font-medium text-[#ef4444] border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            Empty trash
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Empty trash?"
        body={`This permanently deletes all ${count} photo${count === 1 ? "" : "s"} in trash from Cloudinary and Redux. This action cannot be undone.`}
        confirmLabel="Empty Trash"
        destructive
        loading={emptying}
        onConfirm={() => void handleConfirmEmpty()}
        onCancel={() => {
          if (!emptying) setConfirmOpen(false);
        }}
      />
    </>
  );
}
