"use client";

import Image from "next/image";
import { forwardRef } from "react";

export type ProfileMenuVariant = "full" | "compact";

const AVATAR_PX = 36;

interface ProfileMenuTriggerProps {
  variant: ProfileMenuVariant;
  open: boolean;
  onClick: () => void;
  imageUrl?: string | null;
  userName: string;
  credits: number | null;
}

const ProfileMenuTrigger = forwardRef<HTMLButtonElement, ProfileMenuTriggerProps>(
  function ProfileMenuTrigger(
    { variant, open, onClick, imageUrl, userName, credits },
    ref,
  ) {
    const avatar = imageUrl ? (
      <Image
        key={imageUrl}
        src={imageUrl}
        alt=""
        width={AVATAR_PX}
        height={AVATAR_PX}
        className="h-[36px] w-[36px] shrink-0 rounded-lg object-cover"
      />
    ) : (
      <div className="h-[36px] w-[36px] shrink-0 rounded-lg bg-white/[0.06] border border-white/[0.08]" />
    );

    if (variant === "compact") {
      return (
        <button
          ref={ref}
          type="button"
          aria-label="Account menu"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={onClick}
          className={[
            "flex shrink-0 items-center justify-center h-12 w-12 rounded-xl transition-colors cursor-pointer",
            open
              ? "bg-white/[0.07] text-white"
              : "text-white/40 hover:bg-white/[0.07] hover:text-white",
          ].join(" ")}
        >
          {avatar}
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onClick}
        className="flex min-w-0 items-center gap-2.5 w-full rounded-lg px-1.5 py-1.5 -mx-1 hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        {avatar}
        <div className="flex min-w-0 flex-col text-left">
          <span className="text-white text-[14px] leading-[1.3] font-medium truncate">
            {userName}
          </span>
          <span className="text-[#888888] text-[12px] leading-[1.3] whitespace-nowrap truncate">
            {credits !== null ? credits.toLocaleString() : "—"} Credits
          </span>
        </div>
      </button>
    );
  },
);

export default ProfileMenuTrigger;
