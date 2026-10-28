"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  resolveSettingsReturnPath,
  settingsReturnLabel,
} from "@/lib/settings-navigation";

export default function SettingsBackButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigating, startTransition] = useTransition();

  const returnPath = resolveSettingsReturnPath(searchParams.get("returnTo"));
  const label = settingsReturnLabel(returnPath);

  function handleClick() {
    if (navigating) return;
    startTransition(() => router.push(returnPath));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={navigating}
      aria-busy={navigating}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-md text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white disabled:cursor-wait disabled:opacity-60 cursor-pointer"
    >
      {navigating ? (
        <LoadingSpinner size="xs" label={label} />
      ) : (
        <Icon name="ChevronLeft" size={24} aria-hidden />
      )}
    </button>
  );
}
