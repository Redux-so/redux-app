"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Coins } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

interface Bundle {
  id: string;
  name: string;
  credits: number;
  price: number;
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
            <div className="pointer-events-auto w-[400px] bg-[#111111] border border-[#2a2a2a] rounded-sm shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
                <div>
                  <h2 className="text-white text-[14px] font-medium">Purchase Credits</h2>
                  <p className="text-[#888888] text-[11px] mt-[2px]">
                    Credits power all AI features in Redux
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-[26px] h-[26px] rounded-sm text-[#888888] hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={18} className="animate-spin text-[#888888]" />
                  </div>
                ) : bundles.length === 0 ? (
                  <p className="text-[#888888] text-[12px] text-center py-8">
                    No credit packages available right now.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {bundles.map((bundle) => (
                      <div
                        key={bundle.id}
                        className="flex items-center justify-between px-4 py-3 bg-[#161616] border border-[#2a2a2a] rounded-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-[30px] h-[30px] rounded-sm bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                            <Coins size={14} strokeWidth={1.5} className="text-white" />
                          </div>
                          <div>
                            <p className="text-white text-[12px] font-medium">{bundle.name}</p>
                            <p className="text-[#888888] text-[11px]">
                              {bundle.credits.toLocaleString()} credits
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => void handlePurchase(bundle.id)}
                          disabled={purchasing === bundle.id}
                          className="flex items-center gap-[5px] h-[28px] px-3 bg-white text-black text-[11px] font-medium rounded-sm hover:bg-[#e8e8e8] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          {purchasing === bundle.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : null}
                          {formatPrice(bundle.price)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[#2a2a2a]">
                <p className="text-[#555555] text-[10px] text-center">
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
