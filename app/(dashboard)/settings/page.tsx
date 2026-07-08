"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import Link from "next/link";
import BottomNav from "@/components/shared/BottomNav";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import AppChromeLogo from "@/components/shared/AppChromeLogo";
import CreditShopModal from "@/components/shared/CreditShopModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: "PURCHASE" | "DEDUCTION" | "REFUND" | "BONUS";
  amount: number;
  feature: string | null;
  description: string | null;
  createdAt: string;
}

interface Stats {
  creditBalance: number;
  transactionHistory: Transaction[];
  imageCount: number;
  totalStorageBytes: number;
  uploadsToday: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFeature(feature: string | null): string {
  if (!feature) return "—";
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SECTION_LABEL =
  "text-[12px] font-semibold text-[#888888]";
const SETTING_ROW =
  "flex items-center justify-between py-3.5 border-b border-[#2a2a2a] last:border-0";
const BTN_GHOST =
  "h-9 px-4 text-[14px] text-[#888888] border border-[#2a2a2a] rounded-md hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer whitespace-nowrap";

/** Transaction list scrolls after this many rows (~40px per row → max-h-[400px]) */
const TRANSACTION_HISTORY_VISIBLE_ROWS = 10;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-[#1a1a1a] rounded animate-pulse ${className ?? ""}`} />
  );
}

// ─── Confirmation Dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  destructive,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[360px] bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-[30px] h-[30px] rounded-md bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <Icon name="AlertTriangle" size={16} className="text-[#ef4444]" aria-hidden />
          </div>
          <div>
            <p className="text-white text-[14px] font-medium">{title}</p>
            <p className="text-[#888888] text-[14px] mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={loading} className={BTN_GHOST}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center gap-[6px] h-9 px-4 text-[14px] font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
              destructive
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                : "bg-white text-black hover:bg-[#e8e8e8]"
            }`}
          >
            {loading && <LoadingSpinner size="xs" label="Processing" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#2a2a2a]">
        <span className={SECTION_LABEL}>{label}</span>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [creditShopOpen, setCreditShopOpen] = useState(false);

  // Dialog states
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showClearLibrary, setShowClearLibrary] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/user/stats");
      if (!res.ok) return;
      const data = (await res.json()) as Stats;
      setStats(data);
    } catch {
      toast.error("Failed to load stats.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await user?.delete();
      await signOut();
      router.push("/sign-up");
    } catch {
      toast.error("Could not delete account. Please contact support.");
      setDeletingAccount(false);
      setShowDeleteAccount(false);
    }
  }

  async function handleClearLibrary() {
    setClearingLibrary(true);
    try {
      const res = await fetch("/api/user/library", { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to clear library.");
        return;
      }
      const data = (await res.json()) as { deleted?: number };
      toast.success(`Deleted ${data.deleted ?? 0} photo${data.deleted !== 1 ? "s" : ""}.`);
      setStats((prev) =>
        prev ? { ...prev, imageCount: 0, totalStorageBytes: 0, uploadsToday: 0 } : prev,
      );
    } catch {
      toast.error("Failed to clear library.");
    } finally {
      setClearingLibrary(false);
      setShowClearLibrary(false);
    }
  }

  async function handleBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not open billing portal.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#2a2a2a] bg-[#0a0a0a] pl-3 pr-3">
          <Link
            href="/library"
            className="inline-flex shrink-0 items-center no-underline transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80"
          >
            <AppChromeLogo />
          </Link>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
          <div className="max-w-[640px] mx-auto flex flex-col gap-4">
            {/* ── ACCOUNT & PROFILE ── */}
            <Section label="Account & Profile">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 py-5 border-b border-[#2a2a2a]">
                {!userLoaded ? (
                  <Skeleton className="w-[56px] h-[56px] rounded-full shrink-0" />
                ) : user?.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt="avatar"
                    width={56}
                    height={56}
                    className="rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-[56px] h-[56px] rounded-full bg-[#1f1f1f] border border-[#2a2a2a] shrink-0" />
                )}
                <div className="flex flex-col gap-[2px] min-w-0">
                  {!userLoaded ? (
                    <>
                      <Skeleton className="w-[140px] h-[14px]" />
                      <Skeleton className="w-[180px] h-[11px] mt-1" />
                    </>
                  ) : (
                    <>
                      <span className="text-white text-[14px] font-medium truncate">
                        {user?.fullName ?? user?.firstName ?? "—"}
                      </span>
                      <span className="text-[#888888] text-[14px] truncate">
                        {user?.emailAddresses?.[0]?.emailAddress ?? "—"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className={SETTING_ROW}>
                <span className="text-[14px] text-white">Profile</span>
                <button
                  onClick={() => openUserProfile()}
                  className={BTN_GHOST}
                >
                  Edit Profile
                </button>
              </div>
              <div className={SETTING_ROW}>
                <span className="text-[14px] text-white">Password</span>
                <button
                  onClick={() => openUserProfile({ appearance: { variables: { colorPrimary: "#ffffff" } } })}
                  className={BTN_GHOST}
                >
                  Change Password
                </button>
              </div>
              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[14px] text-[#ef4444]">Delete Account</span>
                  <p className="text-[12px] text-[#555555] mt-[2px]">
                    Permanently delete your account and all data
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteAccount(true)}
                  className="h-9 px-4 text-[14px] text-[#ef4444] border border-[#2a2a2a] rounded-md hover:bg-[#1a1a1a] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Delete Account
                </button>
              </div>
            </Section>

            {/* ── CREDITS & BILLING ── */}
            <Section label="Credits & Billing">
              {/* Credit balance card */}
              <div className="py-5 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between bg-[#161616] border border-[#2a2a2a] rounded-xl px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-[32px] h-[32px] rounded-md bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                      <Icon name="Coins01" size={16} className="text-white" aria-hidden />
                    </div>
                    <div>
                      <p className="text-[#888888] text-[12px]">Credit Balance</p>
                      {loadingStats ? (
                        <Skeleton className="w-[60px] h-[20px] mt-1" />
                      ) : (
                        <p className="text-white text-[28px] font-bold leading-none mt-[2px]">
                          {(stats?.creditBalance ?? 0).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setCreditShopOpen(true)}
                    className={BTN_PRIMARY_SOLID}
                  >
                    Purchase Credits
                  </button>
                </div>
              </div>

              {/* Transaction history */}
              <div className="py-5 border-b border-[#2a2a2a]">
                <p className={`${SECTION_LABEL} mb-3`}>Transaction History</p>
                {loadingStats ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[36px] w-full" />
                    ))}
                  </div>
                ) : !stats?.transactionHistory?.length ? (
                  <p className="text-[#555555] text-[14px] py-4 text-center">
                    No transactions yet
                  </p>
                ) : (
                  <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-4 px-3 py-2 bg-[#161616] border-b border-[#2a2a2a]">
                      {["Date", "Feature", "Type", "Amount"].map((h) => (
                        <span key={h} className="text-[11px] font-medium text-[#555555]">
                          {h}
                        </span>
                      ))}
                    </div>
                    <div
                      className={
                        stats.transactionHistory.length > TRANSACTION_HISTORY_VISIBLE_ROWS
                          ? "max-h-[400px] overflow-y-auto"
                          : undefined
                      }
                    >
                      {stats.transactionHistory.map((tx) => (
                        <div
                          key={tx.id}
                          className="grid grid-cols-4 px-3 py-[10px] border-b border-[#2a2a2a] last:border-0 hover:bg-[#161616] transition-colors"
                        >
                          <span className="text-[14px] text-[#888888]">
                            {formatDate(tx.createdAt)}
                          </span>
                          <span className="text-[14px] text-[#888888] truncate">
                            {formatFeature(tx.feature)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              tx.type === "PURCHASE" || tx.type === "BONUS"
                                ? "bg-[#22c55e]/10 text-[#22c55e]"
                                : tx.type === "REFUND"
                                ? "bg-[#f59e0b]/10 text-[#f59e0b]"
                                : "bg-white/[0.06] text-[#888888]"
                            }`}
                          >
                            {tx.type.charAt(0) + tx.type.slice(1).toLowerCase()}
                          </span>
                          <span
                            className={`text-[14px] font-medium ${
                              tx.amount > 0 ? "text-[#22c55e]" : "text-white"
                            }`}
                          >
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Billing portal */}
              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[14px] text-white">Billing History</span>
                  <p className="text-[12px] text-[#555555] mt-[2px]">
                    View invoices and manage payment methods
                  </p>
                </div>
                <button
                  onClick={() => void handleBillingPortal()}
                  disabled={portalLoading}
                  className={`${BTN_GHOST} flex items-center gap-[6px]`}
                >
                  {portalLoading ? (
                    <LoadingSpinner size="xs" label="Opening billing portal" />
                  ) : (
                    <Icon name="LinkExternal01" size={16} aria-hidden />
                  )}
                  Billing Portal
                </button>
              </div>
            </Section>

            {/* ── STORAGE ── */}
            <Section label="Storage">
              <div className={SETTING_ROW}>
                <div className="flex items-center gap-3">
                  <Icon name="Image01" size={16} className="text-[#555555] shrink-0" aria-hidden />
                  <span className="text-[14px] text-white">Photos</span>
                </div>
                {loadingStats ? (
                  <Skeleton className="w-[40px] h-[14px]" />
                ) : (
                  <span className="text-[14px] text-[#888888]">
                    {(stats?.imageCount ?? 0).toLocaleString()} photo{stats?.imageCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className={SETTING_ROW}>
                <div className="flex items-center gap-3">
                  <Icon name="Database01" size={16} className="text-[#555555] shrink-0" aria-hidden />
                  <span className="text-[14px] text-white">Storage Used</span>
                </div>
                {loadingStats ? (
                  <Skeleton className="w-[60px] h-[14px]" />
                ) : (
                  <span className="text-[14px] text-[#888888]">
                    {formatBytes(stats?.totalStorageBytes ?? 0)}
                  </span>
                )}
              </div>

              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[14px] text-[#ef4444]">Clear Library</span>
                  <p className="text-[12px] text-[#555555] mt-[2px]">
                    Permanently delete all your photos
                  </p>
                </div>
                <button
                  onClick={() => setShowClearLibrary(true)}
                  className="h-9 px-4 text-[14px] text-[#ef4444] border border-[#2a2a2a] rounded-md hover:bg-[#1a1a1a] transition-colors cursor-pointer flex items-center gap-[6px] whitespace-nowrap"
                >
                  <Icon name="Trash04" size={16} aria-hidden />
                  Clear Library
                </button>
              </div>
            </Section>

            {/* ── ABOUT ── */}
            <Section label="About">
              <div className="py-5 border-b border-[#2a2a2a]">
                <p className="text-white text-[14px] font-medium">Redux</p>
                <p className="text-[#888888] text-[14px] mt-[2px]">Version 1.0.0</p>
                <p className="text-[#888888] text-[14px] mt-2 leading-relaxed">
                  Your AI agent for professional photo editing
                </p>
              </div>

              <div className={SETTING_ROW}>
                <span className="text-[14px] text-white">Support</span>
                <a
                  href="mailto:admin@redux.so?subject=Redux%20Support%20Request"
                  className={`${BTN_GHOST} flex items-center gap-[6px]`}
                >
                  <Icon name="Mail01" size={16} aria-hidden />
                  Contact Support
                </a>
              </div>

              <div className={SETTING_ROW}>
                <span className="text-[14px] text-white">Legal</span>
                <div className="flex items-center gap-3">
                  <a
                    href="#"
                    className="text-[14px] text-[#888888] underline underline-offset-2 hover:text-white transition-colors"
                  >
                    Terms of Service
                  </a>
                  <a
                    href="#"
                    className="text-[14px] text-[#888888] underline underline-offset-2 hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </a>
                </div>
              </div>
            </Section>

            {/* Bottom padding for BottomNav clearance */}
            <div className="h-2" />
          </div>
        </main>

        <BottomNav />
      </div>

      {/* Modals */}
      <CreditShopModal open={creditShopOpen} onClose={() => setCreditShopOpen(false)} />

      <ConfirmDialog
        open={showDeleteAccount}
        title="Delete your account?"
        body="This will permanently delete your account, all photos, and all data. This action cannot be undone."
        confirmLabel="Delete Account"
        destructive
        loading={deletingAccount}
        onConfirm={() => void handleDeleteAccount()}
        onCancel={() => setShowDeleteAccount(false)}
      />

      <ConfirmDialog
        open={showClearLibrary}
        title="Clear your library?"
        body="This will permanently delete all your photos from Cloudinary, UploadThing, and Redux. This cannot be undone."
        confirmLabel="Clear Library"
        destructive
        loading={clearingLibrary}
        onConfirm={() => void handleClearLibrary()}
        onCancel={() => setShowClearLibrary(false)}
      />
    </>
  );
}
