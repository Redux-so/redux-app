"use client";

import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/shared/Icon";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CreditShopModal from "@/components/shared/CreditShopModal";

interface ProfileMenuProps {
  /** Extra classes for the relative positioning wrapper — lets each usage site control width/alignment. */
  className?: string;
}

/**
 * Avatar + name + credits trigger that opens the Settings / Purchase Credits / Log Out
 * popover. Reusable profile trigger for sidebar and other shell surfaces.
 */
export default function ProfileMenu({ className }: ProfileMenuProps) {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [credits, setCredits] = useState<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [creditShopOpen, setCreditShopOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then((res) => res.json())
      .then((data: { creditBalance?: number }) => {
        if (typeof data.creditBalance === "number") {
          setCredits(data.creditBalance);
        }
      })
      .catch(() => {});
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [popoverOpen]);

  function openCreditShop() {
    setPopoverOpen(false);
    setCreditShopOpen(true);
  }

  async function handleSignOut() {
    setPopoverOpen(false);
    await signOut();
    router.push("/sign-in");
  }

  return (
    <>
      <div
        ref={popoverRef}
        className={["relative flex min-w-0 items-center", className ?? ""].join(" ")}
      >
        {/* Popover */}
        <AnimatePresence>
          {popoverOpen && (
            <motion.div
              key="popover"
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute bottom-full mb-2 left-0 z-50 w-[208px] bg-[#111111] border border-white/[0.1] rounded-xl shadow-2xl origin-bottom-left"
            >
              <div className="py-1.5">
                <button
                  onClick={() => {
                    setPopoverOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer rounded-lg"
                >
                  <Icon name="Settings01" size={16} className="shrink-0 text-[#888888]" aria-hidden />
                  Settings
                </button>

                <button
                  onClick={openCreditShop}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer rounded-lg"
                >
                  <Icon name="Coins01" size={16} className="shrink-0 text-[#888888]" aria-hidden />
                  Purchase Credits
                </button>

                <div className="my-1.5 border-t border-white/[0.08]" />

                <button
                  onClick={() => void handleSignOut()}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#ef4444] hover:bg-white/[0.07] transition-colors cursor-pointer rounded-lg"
                >
                  <Icon name="LogOut01" size={16} className="shrink-0" aria-hidden />
                  Log Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Profile trigger */}
        <button
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="flex min-w-0 items-center gap-2.5 w-full rounded-lg px-1.5 py-1.5 -mx-1 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {user?.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt="avatar"
              width={36}
              height={36}
              className="h-[36px] w-[36px] rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-[36px] h-[36px] rounded-lg bg-white/[0.06] border border-white/[0.08] shrink-0" />
          )}
          <div className="flex min-w-0 flex-col text-left">
            <span className="text-white text-[14px] leading-[1.3] font-medium truncate">
              {user?.fullName ?? user?.firstName ?? ""}
            </span>
            <span className="text-[#888888] text-[12px] leading-[1.3] whitespace-nowrap truncate">
              {credits !== null ? credits.toLocaleString() : "—"} Credits
            </span>
          </div>
        </button>
      </div>

      <CreditShopModal open={creditShopOpen} onClose={() => setCreditShopOpen(false)} />
    </>
  );
}
