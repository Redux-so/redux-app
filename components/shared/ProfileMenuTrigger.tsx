"use client";

import Image from "next/image";
import { forwardRef } from "react";
import {
  LIBRARY_SIDEBAR_PROFILE_BTN,
  LIBRARY_SIDEBAR_PROFILE_BTN_OPEN,
} from "@/constants/library-sidebar";

export type ProfileMenuVariant = "full" | "compact";

const AVATAR_PX = 40;

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
        className="h-[40px] w-[40px] shrink-0 rounded-full object-cover"
      />
    ) : (
      <div className="h-[40px] w-[40px] shrink-0 rounded-full bg-[#1d1d1d] border border-[#282828]" />
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
            "flex shrink-0 items-center justify-center h-12 w-12 rounded-xl border transition-colors cursor-pointer",
            open
              ? "bg-[#1d1d1d] !border-[#282828] text-white"
              : "text-white/40 border-[#121212] hover:bg-[#1d1d1d] hover:text-white",
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
        className={[
          LIBRARY_SIDEBAR_PROFILE_BTN,
          open ? LIBRARY_SIDEBAR_PROFILE_BTN_OPEN : "",
        ].join(" ")}
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
