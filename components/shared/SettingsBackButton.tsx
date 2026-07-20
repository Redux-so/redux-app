"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  resolveSettingsReturnPath,
  settingsReturnLabel,
} from "@/lib/settings-navigation";

export default function SettingsBackButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigating, setNavigating] = useState(false);

  const returnPath = resolveSettingsReturnPath(searchParams.get("returnTo"));
  const label = settingsReturnLabel(returnPath);

  async function handleClick() {
    if (navigating) return;
    setNavigating(true);
    try {
      router.push(returnPath);
    } finally {
      setNavigating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={navigating}
      className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-[#888888] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60 cursor-pointer"
    >
      {navigating ? (
        <LoadingSpinner size="xs" label={label} />
      ) : (
        <Icon name="ChevronLeft" size={20} aria-hidden />
      )}
      {label}
    </button>
  );
}
