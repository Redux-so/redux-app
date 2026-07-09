"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BTN_MODAL_SOLID } from "@/lib/button-styles";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

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

export default function CreditShopModal({ open, onClose }: CreditShopModalProps) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

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
        window.location.href = data.url;
      }
    } catch {
      toast.error("Purchase failed. Please try again.");
    } finally {
      setPurchasing(null);
    }
  }

  return (
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
            className="fixed inset-0 z-40 bg-black/60"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto mx-4 w-full max-w-[440px] bg-[#111111]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
                <div>
                  <h2 className="text-white text-[16px] font-medium">Purchase Credits</h2>
                  <p className="text-[#888888] text-[12px] mt-[2px]">
                    Credits power all AI features in Redux
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer"
                >
                  <Icon name="XClose" size={16} aria-hidden />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <LoadingSpinner size="md" label="Loading credit bundles" />
                  </div>
                ) : bundles.length === 0 ? (
                  <p className="text-[#888888] text-[13px] text-center py-8">
                    No credit packages available right now.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {bundles.map((bundle) => (
                      <div
                        key={bundle.id}
                        className={`flex items-center justify-between rounded-xl px-4 py-3.5 border ${
                          bundle.popular
                            ? "border-[#794ADE]/40 bg-[#794ADE]/[0.06]"
                            : "border-white/[0.08] bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                            bundle.popular ? "border-[#794ADE]/40 bg-[#794ADE]/[0.12]" : "border-white/[0.08] bg-white/[0.05]"
                          }`}>
                            <Icon name="Coins01" size={16} className={bundle.popular ? "text-[#B07EF0]" : "text-white"} aria-hidden />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-[13px] font-medium">{bundle.name}</p>
                              {bundle.popular && (
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#794ADE]/20 text-[#B07EF0]">
                                  Popular
                                </span>
                              )}
                            </div>
                            <p className="text-[#888888] text-[12px]">
                              {bundle.credits.toLocaleString()} credits
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => void handlePurchase(bundle.id)}
                          disabled={purchasing === bundle.id}
                          className={`${BTN_MODAL_SOLID} shrink-0`}
                        >
                          {purchasing === bundle.id ? (
                            <LoadingSpinner size="xs" variant="default" label="Processing purchase" />
                          ) : null}
                          {formatPrice(bundle.price)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.08] px-6 py-3.5">
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
}
