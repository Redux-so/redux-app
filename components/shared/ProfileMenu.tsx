"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/shared/Icon";
import ProfileMenuTrigger, {
  type ProfileMenuVariant,
} from "@/components/shared/ProfileMenuTrigger";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import CreditShopModal from "@/components/shared/CreditShopModal";
import {
  buildSettingsHref,
} from "@/lib/settings-navigation";

const POPOVER_ESTIMATED_HEIGHT = 168;

interface ProfileMenuProps {
  variant?: ProfileMenuVariant;
  /** Extra classes for the relative positioning wrapper — lets each usage site control width/alignment. */
  className?: string;
  /** When set, popover spans this width (e.g. full library sidebar). */
  popoverPanelWidthPx?: number;
  /** Negative inset aligns popover left edge with a parent panel edge (e.g. sidebar footer padding). */
  popoverInsetLeftPx?: number;
  /** Horizontally center the popover over the trigger wrapper (library footer). */
  popoverCentered?: boolean;
  /** Where Settings should return after back navigation. Defaults from current route. */
  settingsReturnPath?: string;
}

function ProfileMenuPopoverContent({
  onSettings,
  onPurchaseCredits,
  onSignOut,
}: {
  onSettings: () => void;
  onPurchaseCredits: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={onSettings}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer rounded-lg"
      >
        <Icon name="Settings01" size={16} className="shrink-0 text-[#888888]" aria-hidden />
        Settings
      </button>

      <button
        type="button"
        onClick={onPurchaseCredits}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#cccccc] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer rounded-lg"
      >
        <Icon name="Coins01" size={16} className="shrink-0 text-[#888888]" aria-hidden />
        Purchase Credits
      </button>

      <div className="my-1.5 border-t border-white/[0.08]" />

      <button
        type="button"
        onClick={onSignOut}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#ef4444] hover:bg-[#1d1d1d] transition-colors cursor-pointer rounded-lg"
      >
        <Icon name="LogOut01" size={16} className="shrink-0" aria-hidden />
        Log Out
      </button>
    </div>
  );
}

/**
 * Avatar trigger + Settings / Purchase Credits / Log Out popover.
 * `full` — library sidebar (avatar, name, credits). `compact` — editor tool rail (avatar only).
 */
export default function ProfileMenu({
  variant = "full",
  className,
  popoverPanelWidthPx,
  popoverInsetLeftPx = 0,
  popoverCentered = false,
  settingsReturnPath,
}: ProfileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [credits, setCredits] = useState<number | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [creditShopOpen, setCreditShopOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const resolvedPopoverWidth = popoverPanelWidthPx ?? 208;
  const usePortaledPopover = variant === "compact";

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

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? POPOVER_ESTIMATED_HEIGHT;
    const gap = 8;

    let left = rect.right + gap;
    let top = rect.bottom - menuHeight;

    if (left + resolvedPopoverWidth > window.innerWidth - gap) {
      left = Math.max(gap, rect.left - resolvedPopoverWidth - gap);
    }

    if (top < gap) {
      top = gap;
    }

    if (top + menuHeight > window.innerHeight - gap) {
      top = Math.max(gap, window.innerHeight - menuHeight - gap);
    }

    setMenuCoords({ left, top });
  }, [resolvedPopoverWidth]);

  useLayoutEffect(() => {
    if (!popoverOpen || !usePortaledPopover) return;
    updateMenuPosition();
  }, [popoverOpen, usePortaledPopover, updateMenuPosition]);

  useEffect(() => {
    if (!popoverOpen) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setPopoverOpen(false);
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setPopoverOpen(false);
    }

    function handleReposition() {
      if (usePortaledPopover) updateMenuPosition();
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [popoverOpen, usePortaledPopover, updateMenuPosition]);

  function openCreditShop() {
    setPopoverOpen(false);
    setCreditShopOpen(true);
  }

  async function handleSignOut() {
    setPopoverOpen(false);
    await signOut();
    router.push("/sign-in");
  }

  const userName = user?.fullName ?? user?.firstName ?? "";
  const resolvedSettingsReturnPath =
    settingsReturnPath ??
    (pathname === "/editor" ? "/editor" : "/library");

  const popoverContent = (
    <ProfileMenuPopoverContent
      onSettings={() => {
        setPopoverOpen(false);
        router.push(buildSettingsHref(resolvedSettingsReturnPath));
      }}
      onPurchaseCredits={openCreditShop}
      onSignOut={() => void handleSignOut()}
    />
  );

  const portaledPopover =
    usePortaledPopover && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {popoverOpen && menuCoords && (
              <motion.div
                ref={menuRef}
                key="profile-menu-portal"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: menuCoords.top,
                  left: menuCoords.left,
                  width: resolvedPopoverWidth,
                  zIndex: 80,
                }}
                className="bg-[#121212] border border-[#2e2e2e] rounded-xl shadow-2xl origin-bottom-left"
              >
                {popoverContent}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={rootRef}
        className={[
          "relative flex min-w-0 items-center",
          variant === "compact" ? "justify-center" : "",
          className ?? "",
        ].join(" ")}
      >
        {!usePortaledPopover && (
          <AnimatePresence>
            {popoverOpen && (
              <motion.div
                key="popover"
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={[
                  "absolute bottom-full mb-2 z-50 bg-[#121212] border border-[#2e2e2e] rounded-xl shadow-2xl",
                  popoverCentered
                    ? "left-1/2 -translate-x-1/2 origin-bottom"
                    : "origin-bottom-left",
                ].join(" ")}
                style={{
                  width: resolvedPopoverWidth,
                  ...(popoverCentered ? {} : { left: popoverInsetLeftPx }),
                }}
              >
                {popoverContent}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <ProfileMenuTrigger
          ref={triggerRef}
          variant={variant}
          open={popoverOpen}
          onClick={() => {
            if (!popoverOpen && usePortaledPopover && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              setMenuCoords({
                left: rect.right + 8,
                top: Math.max(
                  8,
                  rect.bottom - POPOVER_ESTIMATED_HEIGHT,
                ),
              });
            }
            setPopoverOpen((prev) => !prev);
          }}
          imageUrl={user?.imageUrl}
          userName={userName}
          credits={credits}
        />
      </div>

      {portaledPopover}

      <CreditShopModal open={creditShopOpen} onClose={() => setCreditShopOpen(false)} />
    </>
  );
}
