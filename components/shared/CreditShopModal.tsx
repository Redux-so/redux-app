"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/shared/Icon";
import EmptyState from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BTN_MODAL_SOLID } from "@/lib/button-styles";
import {
  BRAND_BG_CLASS,
  BRAND_LINK_TEXT_CLASS,
  PRIMARY_BRAND_HEX,
  PRIMARY_BRAND_RGB,
} from "@/lib/brand-colors";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { openExternalUrl } from "@/constants/support";

interface Bundle {
  id: string;
  name: string;
  credits: number;
  price: number;
  /** Backend can set this to highlight the recommended tier (Rule 6). */
  popular?: boolean;
}

interface CreditShopModalProps {
  open: boolean;
  onClose: () => void;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/** Advanced tier — 1,600 credits / $50 */
function isBestValueBundle(bundle: Bundle): boolean {
  return bundle.name === "Advanced";
}

const BEST_VALUE_BORDER_CLASS = `border-2 border-[${PRIMARY_BRAND_HEX}] shadow-[0_7px_16px_rgba(${PRIMARY_BRAND_RGB},0.1),0_13px_30px_rgba(${PRIMARY_BRAND_RGB},0.05)]`;

export default function CreditShopModal({ open, onClose }: CreditShopModalProps) {
  const [mounted, setMounted] = useState(false);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/credits/bundles")
      .then((r) => r.json())
      .then((data: { bundles?: Bundle[] }) => {
        setBundles(data.bundles ?? []);
      })
      .catch(() => {
        toast.error("Failed to load credit packages.");
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !purchasing) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose, purchasing]);

  async function handlePurchase(bundleId: string) {
    setPurchasing(bundleId);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Purchase failed.");
        return;
      }
      if (data.url) {
        openExternalUrl(data.url);
      }
    } catch {
      toast.error("Purchase failed. Please try again.");
    } finally {
      setPurchasing(null);
    }
  }

  const modal = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto mx-4 w-full max-w-[440px] bg-[#121212] border border-[#212121] rounded-xl shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#212121] px-6 py-4">
                <h2 className="text-white text-[16px] font-medium">Purchase Credits</h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer"
                >
                  <Icon name="XClose" size={16} aria-hidden />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-visible px-6 py-5">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <LoadingSpinner size="md" label="Loading credit bundles" />
                  </div>
                ) : bundles.length === 0 ? (
                  <EmptyState
                    className="py-8"
                    icon="Coins01"
                    message="No credit packages available right now."
                  />
                ) : (
                  <div className="flex flex-col gap-2.5 overflow-visible">
                    {bundles.map((bundle) => {
                      const bestValue = isBestValueBundle(bundle);
                      return (
                      <div
                        key={bundle.id}
                        className={bestValue ? "relative isolate pb-1.5" : undefined}
                      >
                        {bestValue && (
                          <div
                            aria-hidden
                            className={`pointer-events-none absolute left-5 right-5 top-[62%] -bottom-2 rounded-[999px] bg-[${PRIMARY_BRAND_HEX}]/11 blur-[11px]`}
                          />
                        )}
                        <div
                        className={`flex items-center justify-between rounded-xl px-4 py-3.5 border bg-[#161616] ${
                          bestValue ? `relative z-[1] ${BEST_VALUE_BORDER_CLASS}` : bundle.popular
                            ? `border-[${PRIMARY_BRAND_HEX}]/40`
                            : "border-[#1c1c1c]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                            bundle.popular ? `border-[${PRIMARY_BRAND_HEX}]/40 bg-[${PRIMARY_BRAND_HEX}]/[0.12]` : "border-[#262626] bg-[#1d1d1d]"
                          }`}>
                            <Icon name="Coins01" size={16} className={bundle.popular ? BRAND_LINK_TEXT_CLASS : "text-white"} aria-hidden />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-[13px] font-medium">{bundle.name}</p>
                              {bundle.popular && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium bg-[${PRIMARY_BRAND_HEX}]/20 ${BRAND_LINK_TEXT_CLASS}`}>
                                  Popular
                                </span>
                              )}
                            </div>
                            <p className="text-[#888888] text-[12px]">
                              {bundle.credits.toLocaleString()} credits
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {bestValue && (
                            <span className={`rounded-full ${BRAND_BG_CLASS} px-2 py-0.5 text-[10px] font-bold text-white whitespace-nowrap`}>
                              Best Value
                            </span>
                          )}
                          <button
                            onClick={() => void handlePurchase(bundle.id)}
                            disabled={purchasing === bundle.id}
                            className={`${BTN_MODAL_SOLID} shrink-0`}
                          >
                            {purchasing === bundle.id ? (
                              <LoadingSpinner size="xs" label="Processing purchase" />
                            ) : null}
                            {formatPrice(bundle.price)}
                          </button>
                        </div>
                      </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-[#212121] px-6 py-3.5">
                <p className="text-[#555555] text-[12px] text-center">
                  Secure checkout powered by Stripe · Credits never expire
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;

  return createPortal(modal, document.body);
}
