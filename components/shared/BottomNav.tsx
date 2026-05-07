"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  LayoutGrid,
  SlidersHorizontal,
  Settings,
  CreditCard,
  LogOut,
  ImageIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import CreditShopModal from "@/components/shared/CreditShopModal";

const TABS = [
  { label: "Library", icon: LayoutGrid, href: "/library" },
  { label: "Editor", icon: SlidersHorizontal, href: "/editor" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
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
      <nav className="grid h-[52px] grid-cols-[140px_1fr_140px] items-center bg-[#0a0a0a] px-3 border-t border-[#2a2a2a] shrink-0">
        {/* User info — clickable profile area */}
        <div ref={popoverRef} className="relative flex items-center justify-self-start w-[140px]">
          {/* Popover */}
          <AnimatePresence>
            {popoverOpen && (
              <motion.div
                key="popover"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-full mb-2 left-0 z-50 w-[180px] bg-[#111111] border border-[#2a2a2a] rounded-sm shadow-xl origin-bottom-left"
              >
                <div className="py-1">
                  <button
                    onClick={() => {
                      setPopoverOpen(false);
                      router.push("/settings");
                    }}
                    className="w-full flex items-center gap-[10px] px-3 py-[8px] text-[12px] text-[#cccccc] hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer"
                  >
                    <Settings size={13} strokeWidth={1.5} className="shrink-0 text-[#888888]" />
                    Settings
                  </button>

                  <button
                    onClick={openCreditShop}
                    className="w-full flex items-center gap-[10px] px-3 py-[8px] text-[12px] text-[#cccccc] hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer"
                  >
                    <CreditCard size={13} strokeWidth={1.5} className="shrink-0 text-[#888888]" />
                    Purchase Credits
                  </button>

                  <div className="my-1 border-t border-[#2a2a2a]" />

                  <button
                    onClick={() => void handleSignOut()}
                    className="w-full flex items-center gap-[10px] px-3 py-[8px] text-[12px] text-[#ef4444] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  >
                    <LogOut size={13} strokeWidth={1.5} className="shrink-0" />
                    Log Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Profile trigger */}
          <button
            onClick={() => setPopoverOpen((prev) => !prev)}
            className="flex items-center gap-2 w-full rounded-sm px-1 py-1 -mx-1 hover:bg-[#161616] transition-colors cursor-pointer"
          >
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt="avatar"
                width={26}
                height={26}
                className="rounded-sm object-cover shrink-0"
              />
            ) : (
              <div className="w-[26px] h-[26px] rounded-sm bg-[#1f1f1f] border border-[#2a2a2a] shrink-0" />
            )}
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-white text-[12px] leading-[1.3] font-medium truncate">
                {user?.fullName ?? user?.firstName ?? ""}
              </span>
              <span className="text-[#888888] text-[10px] leading-[1.3]">
                {credits !== null ? credits.toLocaleString() : "—"} Credits
              </span>
            </div>
          </button>
        </div>

        {/* Tabs — centered in the bar (symmetric left/right columns) */}
        <div className="flex justify-center items-center">
          <div className="flex items-center justify-center gap-[3px]">
            {TABS.map(({ label, icon: Icon, href }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + "/");

              return (
                <button
                  key={label}
                  onClick={() => {
                    if (label === "Editor") {
                      if (pathname.startsWith("/editor")) return;
                      // Use a unique id each click so react-hot-toast never deduplicates
                      toast.custom(
                        () => (
                          <div className="flex items-center gap-2.5 rounded-sm border border-[#22c55e] bg-[#111111] px-[14px] py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
                            <ImageIcon size={16} color="#22c55e" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                            <span style={{ color: "#ffffff", fontSize: "13px", fontFamily: "-apple-system, system-ui, sans-serif" }}>
                              Select a photo from your library to start editing
                            </span>
                          </div>
                        ),
                        {
                          id: `editor-guard-${Date.now()}`,
                          duration: 4000,
                          position: "top-left",
                          style: { marginLeft: 20, marginTop: 72 },
                        },
                      );
                    } else {
                      router.push(href);
                    }
                  }}
                  className={[
                    "flex flex-col items-center justify-center gap-[3px] px-5 py-[6px] rounded-sm transition-colors cursor-pointer min-w-[72px]",
                    isActive
                      ? "bg-[#1f1f1f] border border-[#333333] text-white"
                      : "border border-transparent text-[#888888] hover:text-[#cccccc]",
                  ].join(" ")}
                >
                  <Icon size={13} strokeWidth={1.5} />
                  <span className="text-[11px] leading-none tracking-tight">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mirrors profile column width so tabs stay visually centered in the nav */}
        <div className="w-[140px] justify-self-end shrink-0" aria-hidden />
      </nav>

      <CreditShopModal open={creditShopOpen} onClose={() => setCreditShopOpen(false)} />
    </>
  );
}
