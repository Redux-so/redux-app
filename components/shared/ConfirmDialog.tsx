"use client";

import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

const BTN_GHOST =
  "h-9 px-4 text-[14px] text-[#888888] border border-[#212121] rounded-md hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  destructive,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="redux-popup-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/70">
      <div className="redux-popup-enter w-[360px] bg-[#121212] border border-[#212121] rounded-xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-[30px] h-[30px] rounded-md bg-[#1d1d1d] border border-[#262626] flex items-center justify-center">
            <Icon name="AlertTriangle" size={16} className="text-[#ef4444]" aria-hidden />
          </div>
          <div>
            <p className="text-white text-[14px] font-medium">{title}</p>
            <p className="text-[#888888] text-[14px] mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className={BTN_GHOST}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center gap-[6px] h-9 px-4 text-[14px] font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                : "bg-white text-black hover:bg-[#e8e8e8]"
            }`}
          >
            {loading && <LoadingSpinner size="xs" label="Processing" />}
            {!loading && confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
