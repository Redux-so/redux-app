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
  const [editorHintVisible, setEditorHintVisible] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const editorHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (editorHintTimer.current) clearTimeout(editorHintTimer.current);
    };
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

  function showEditorHint() {
    if (editorHintTimer.current) clearTimeout(editorHintTimer.current);
    setEditorHintVisible(true);
    editorHintTimer.current = setTimeout(() => setEditorHintVisible(false), 4000);
  }

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
      {/* Editor hint notification — rendered directly in BottomNav, no external toast library */}
      <AnimatePresence>
        {editorHintVisible && (
          <motion.div
            key="editor-hint"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed top-[72px] left-5 z-50 flex items-center gap-2.5 rounded-xl border border-[#22c55e]/40 bg-black/60 backdrop-blur-xl px-[14px] py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)] pointer-events-none"
          >
            <ImageIcon size={14} strokeWidth={1.5} className="text-[#22c55e] shrink-0" />
            <span className="text-white text-[13px]">
              Select a photo from your library to start editing
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="grid h-16 grid-cols-[168px_1fr_168px] items-center bg-black/40 backdrop-blur-2xl px-3 border-t border-white/[0.08] shrink-0">
        {/* User info — clickable profile area */}
        <div ref={popoverRef} className="relative flex min-w-0 items-center justify-self-start w-[168px] max-w-[180px]">
          {/* Popover */}
          <AnimatePresence>
            {popoverOpen && (
              <motion.div
                key="popover"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-full mb-2 left-0 z-50 w-[208px] bg-black/70 backdrop-blur-2xl border border-white/[0.1] rounded-xl shadow-2xl origin-bottom-left"
              >
                <div className="py-1.5">
                  <button
                    onClick={() => {
                      setPopoverOpen(false);
                      router.push("/settings");
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer rounded-lg"
                  >
                    <Settings size={15} strokeWidth={1.5} className="shrink-0 text-[#888888]" />
                    Settings
                  </button>

                  <button
                    onClick={openCreditShop}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer rounded-lg"
                  >
                    <CreditCard size={15} strokeWidth={1.5} className="shrink-0 text-[#888888]" />
                    Purchase Credits
                  </button>

                  <div className="my-1.5 border-t border-white/[0.08]" />

                  <button
                    onClick={() => void handleSignOut()}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#ef4444] hover:bg-white/[0.07] transition-colors cursor-pointer rounded-lg"
                  >
                    <LogOut size={15} strokeWidth={1.5} className="shrink-0" />
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
                    if (label !== "Editor") {
                      router.push(href);
                      return;
                    }
                    if (pathname.startsWith("/editor")) return;
                    showEditorHint();
                  }}
                  className={[
                    "flex flex-col items-center justify-center gap-1 px-5 py-2 rounded-xl transition-all cursor-pointer min-w-[72px]",
                    isActive
                      ? "bg-[#682FBF]/20 border border-[#682FBF]/40 text-[#B07EF0]"
                      : "border border-transparent text-[#888888] hover:text-[#cccccc] hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span className="text-[12px] leading-none tracking-tight">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mirrors profile column width so tabs stay visually centered in the nav */}
        <div className="w-[168px] justify-self-end shrink-0" aria-hidden />
      </nav>

      <CreditShopModal open={creditShopOpen} onClose={() => setCreditShopOpen(false)} />
    </>
  );
}
