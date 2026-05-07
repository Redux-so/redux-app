"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  Zap,
  ImageIcon,
  Database,
  Trash2,
  ExternalLink,
  Mail,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import BottomNav from "@/components/shared/BottomNav";
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
  "text-[10px] font-medium tracking-[0.12em] uppercase text-[#555555]";
const SETTING_ROW =
  "flex items-center justify-between py-3 border-b border-[#2a2a2a] last:border-0";
const BTN_GHOST =
  "h-[28px] px-3 text-[12px] text-[#888888] border border-[#2a2a2a] rounded-sm hover:bg-[#1a1a1a] hover:text-white transition-colors cursor-pointer whitespace-nowrap";
const BTN_PRIMARY =
  "h-[28px] px-3 text-[12px] font-medium bg-white text-black rounded-sm hover:bg-[#e8e8e8] transition-colors cursor-pointer whitespace-nowrap";

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-[#1a1a1a] rounded-sm animate-pulse ${className ?? ""}`}
    />
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
      <div className="w-[360px] bg-[#111111] border border-[#2a2a2a] rounded-sm shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-[30px] h-[30px] rounded-sm bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <AlertTriangle size={14} strokeWidth={1.5} className="text-[#ef4444]" />
          </div>
          <div>
            <p className="text-white text-[13px] font-medium">{title}</p>
            <p className="text-[#888888] text-[12px] mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={loading} className={BTN_GHOST}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center gap-[6px] h-[28px] px-3 text-[12px] font-medium rounded-sm transition-colors cursor-pointer disabled:opacity-50 ${
              destructive
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                : "bg-white text-black hover:bg-[#e8e8e8]"
            }`}
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
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
    <div className="bg-[#111111] border border-[#2a2a2a] rounded-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <span className={SECTION_LABEL}>{label}</span>
      </div>
      <div className="px-4">{children}</div>
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

  const uploadsRemaining = Math.max(0, 5 - (stats?.uploadsToday ?? 0));
  const uploadPct = Math.min(100, ((stats?.uploadsToday ?? 0) / 5) * 100);

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#111111",
            color: "#fff",
            border: "1px solid #2a2a2a",
            fontSize: "12px",
          },
        }}
      />

      <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
        {/* Header */}
        <header className="h-[52px] bg-[#0a0a0a] border-b border-[#2a2a2a] flex items-center gap-3 shrink-0 pl-3 pr-3">
          <div className="flex h-[52px] shrink-0 items-center">
            <AppChromeLogo />
          </div>
          <div className="w-px h-[18px] bg-[#2a2a2a] shrink-0" />
          <span className="text-white text-[13px] font-medium">Settings</span>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
          <div className="max-w-[640px] mx-auto flex flex-col gap-4">
            {/* ── ACCOUNT & PROFILE ── */}
            <Section label="Account & Profile">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 py-4 border-b border-[#2a2a2a]">
                {!userLoaded ? (
                  <Skeleton className="w-[52px] h-[52px] rounded-full shrink-0" />
                ) : user?.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt="avatar"
                    width={52}
                    height={52}
                    className="rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-[52px] h-[52px] rounded-full bg-[#1f1f1f] border border-[#2a2a2a] shrink-0" />
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
                      <span className="text-[#888888] text-[12px] truncate">
                        {user?.emailAddresses?.[0]?.emailAddress ?? "—"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className={SETTING_ROW}>
                <span className="text-[13px] text-white">Profile</span>
                <button
                  onClick={() => openUserProfile()}
                  className={BTN_GHOST}
                >
                  Edit Profile
                </button>
              </div>
              <div className={SETTING_ROW}>
                <span className="text-[13px] text-white">Password</span>
                <button
                  onClick={() => openUserProfile({ appearance: { variables: { colorPrimary: "#ffffff" } } })}
                  className={BTN_GHOST}
                >
                  Change Password
                </button>
              </div>
              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[13px] text-[#ef4444]">Delete Account</span>
                  <p className="text-[11px] text-[#555555] mt-[2px]">
                    Permanently delete your account and all data
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteAccount(true)}
                  className="h-[28px] px-3 text-[12px] text-[#ef4444] border border-[#2a2a2a] rounded-sm hover:bg-[#1a1a1a] transition-colors cursor-pointer whitespace-nowrap"
                >
                  Delete Account
                </button>
              </div>
            </Section>

            {/* ── CREDITS & BILLING ── */}
            <Section label="Credits & Billing">
              {/* Credit balance card */}
              <div className="py-4 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between bg-[#161616] border border-[#2a2a2a] rounded-sm px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-[32px] h-[32px] rounded-sm bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                      <Zap size={14} strokeWidth={1.5} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[#888888] text-[11px]">Credit Balance</p>
                      {loadingStats ? (
                        <Skeleton className="w-[60px] h-[20px] mt-1" />
                      ) : (
                        <p className="text-white text-[20px] font-semibold leading-none mt-[2px]">
                          {(stats?.creditBalance ?? 0).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setCreditShopOpen(true)}
                    className={BTN_PRIMARY}
                  >
                    Purchase Credits
                  </button>
                </div>
              </div>

              {/* Transaction history */}
              <div className="py-4 border-b border-[#2a2a2a]">
                <p className={`${SECTION_LABEL} mb-3`}>Transaction History</p>
                {loadingStats ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[36px] w-full" />
                    ))}
                  </div>
                ) : !stats?.transactionHistory?.length ? (
                  <p className="text-[#555555] text-[12px] py-4 text-center">
                    No transactions yet
                  </p>
                ) : (
                  <div className="border border-[#2a2a2a] rounded-sm overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-4 px-3 py-2 bg-[#161616] border-b border-[#2a2a2a]">
                      {["Date", "Feature", "Type", "Amount"].map((h) => (
                        <span key={h} className="text-[10px] text-[#555555] uppercase tracking-[0.1em] font-medium">
                          {h}
                        </span>
                      ))}
                    </div>
                    {stats.transactionHistory.map((tx) => (
                      <div
                        key={tx.id}
                        className="grid grid-cols-4 px-3 py-[10px] border-b border-[#2a2a2a] last:border-0 hover:bg-[#161616] transition-colors"
                      >
                        <span className="text-[12px] text-[#888888]">
                          {formatDate(tx.createdAt)}
                        </span>
                        <span className="text-[12px] text-[#888888] truncate">
                          {formatFeature(tx.feature)}
                        </span>
                        <span
                          className={`text-[11px] font-medium uppercase tracking-wide ${
                            tx.type === "PURCHASE" || tx.type === "BONUS"
                              ? "text-[#22c55e]"
                              : tx.type === "REFUND"
                              ? "text-[#f59e0b]"
                              : "text-[#888888]"
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span
                          className={`text-[12px] font-medium ${
                            tx.amount > 0 ? "text-[#22c55e]" : "text-white"
                          }`}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Billing portal */}
              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[13px] text-white">Billing History</span>
                  <p className="text-[11px] text-[#555555] mt-[2px]">
                    View invoices and manage payment methods
                  </p>
                </div>
                <button
                  onClick={() => void handleBillingPortal()}
                  disabled={portalLoading}
                  className={`${BTN_GHOST} flex items-center gap-[6px]`}
                >
                  {portalLoading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <ExternalLink size={11} strokeWidth={1.5} />
                  )}
                  Billing Portal
                </button>
              </div>
            </Section>

            {/* ── STORAGE ── */}
            <Section label="Storage">
              <div className={SETTING_ROW}>
                <div className="flex items-center gap-3">
                  <ImageIcon size={14} strokeWidth={1.5} className="text-[#555555] shrink-0" />
                  <span className="text-[13px] text-white">Photos</span>
                </div>
                {loadingStats ? (
                  <Skeleton className="w-[40px] h-[14px]" />
                ) : (
                  <span className="text-[12px] text-[#888888]">
                    {(stats?.imageCount ?? 0).toLocaleString()} photo{stats?.imageCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Free-tier daily upload limit */}
              <div className="py-3 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-[#888888]">Daily uploads</span>
                  {loadingStats ? (
                    <Skeleton className="w-[60px] h-[11px]" />
                  ) : (
                    <span className="text-[11px] text-[#888888]">
                      {uploadsRemaining} of 5 remaining
                    </span>
                  )}
                </div>
                <div className="h-[3px] w-full bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3b82f6] rounded-full transition-all"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>

              <div className={SETTING_ROW}>
                <div className="flex items-center gap-3">
                  <Database size={14} strokeWidth={1.5} className="text-[#555555] shrink-0" />
                  <span className="text-[13px] text-white">Storage Used</span>
                </div>
                {loadingStats ? (
                  <Skeleton className="w-[60px] h-[14px]" />
                ) : (
                  <span className="text-[12px] text-[#888888]">
                    {formatBytes(stats?.totalStorageBytes ?? 0)}
                  </span>
                )}
              </div>

              <div className={SETTING_ROW}>
                <div>
                  <span className="text-[13px] text-[#ef4444]">Clear Library</span>
                  <p className="text-[11px] text-[#555555] mt-[2px]">
                    Permanently delete all your photos
                  </p>
                </div>
                <button
                  onClick={() => setShowClearLibrary(true)}
                  className="h-[28px] px-3 text-[12px] text-[#ef4444] border border-[#2a2a2a] rounded-sm hover:bg-[#1a1a1a] transition-colors cursor-pointer flex items-center gap-[6px] whitespace-nowrap"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                  Clear Library
                </button>
              </div>
            </Section>

            {/* ── ABOUT ── */}
            <Section label="About">
              <div className="py-4 border-b border-[#2a2a2a]">
                <p className="text-white text-[14px] font-medium">Redux</p>
                <p className="text-[#888888] text-[12px] mt-[2px]">Version 1.0.0</p>
                <p className="text-[#888888] text-[12px] mt-2 leading-relaxed">
                  Your AI agent for professional photo editing
                </p>
              </div>

              <div className={SETTING_ROW}>
                <span className="text-[13px] text-white">Support</span>
                <a
                  href="mailto:admin@redux.so?subject=Redux%20Support%20Request"
                  className={`${BTN_GHOST} flex items-center gap-[6px]`}
                >
                  <Mail size={11} strokeWidth={1.5} />
                  Contact Support
                </a>
              </div>

              <div className={SETTING_ROW}>
                <span className="text-[13px] text-white">Legal</span>
                <div className="flex items-center gap-3">
                  <a
                    href="#"
                    className="text-[12px] text-[#888888] underline underline-offset-2 hover:text-white transition-colors"
                  >
                    Terms of Service
                  </a>
                  <a
                    href="#"
                    className="text-[12px] text-[#888888] underline underline-offset-2 hover:text-white transition-colors"
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
