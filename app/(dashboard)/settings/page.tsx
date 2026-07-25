"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import toast from "react-hot-toast";
import SettingsBackButton from "@/components/shared/SettingsBackButton";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import CreditShopModal from "@/components/shared/CreditShopModal";
import { reduxUserProfileAppearance } from "@/lib/redux-clerk-appearance";
import {
  SETTINGS_NAV_ITEMS,
  TRANSACTION_HISTORY_PREVIEW_ROWS,
  type SettingsSectionId,
} from "@/components/settings/settings-nav";
import {
  SURFACE_BTN_ACTIVE,
  SURFACE_BTN_IDLE_ON_MAIN,
  SURFACE_BTN_ROW,
} from "@/lib/surface-colors";

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

const SECTION_LABEL = "text-[12px] font-semibold text-[#888888]";
const SETTING_ROW =
  "flex items-center justify-between py-3.5 border-b border-[#2e2e2e] last:border-0";
const BTN_GHOST =
  "h-9 px-4 text-[14px] text-[#888888] border border-[#2e2e2e] rounded-md hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer whitespace-nowrap";

const NAV_ITEM_BASE = [
  "shrink-0 rounded-lg px-3 py-2 text-left text-[14px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-white/20",
  SURFACE_BTN_ROW,
].join(" ");

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-[#1d1d1d] rounded animate-pulse ${className ?? ""}`} />
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#121212] border border-[#2e2e2e] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#2e2e2e]">
        <span className={SECTION_LABEL}>{label}</span>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  );
}

function SettingsNavItem({
  label,
  active,
  onClick,
  layout,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  layout: "vertical" | "horizontal";
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={[
        NAV_ITEM_BASE,
        active
          ? `${SURFACE_BTN_ACTIVE} ${layout === "horizontal" ? "whitespace-nowrap" : "w-full"}`
          : `${SURFACE_BTN_IDLE_ON_MAIN} ${layout === "horizontal" ? "rounded-md whitespace-nowrap" : "w-full"}`,
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="border border-[#2e2e2e] rounded-xl overflow-hidden">
      <div className="grid grid-cols-4 px-3 py-2 bg-[#161616] border-b border-[#2e2e2e]">
        {["Date", "Feature", "Type", "Amount"].map((h) => (
          <span key={h} className="text-[11px] font-medium text-[#555555]">
            {h}
          </span>
        ))}
      </div>
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="grid grid-cols-4 px-3 py-[10px] border-b border-[#2e2e2e] last:border-0 hover:bg-[#161616] transition-colors"
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
                  : "bg-[#1d1d1d] text-[#888888]"
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>("profile");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [creditShopOpen, setCreditShopOpen] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

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

  useEffect(() => {
    setShowAllTransactions(false);
  }, [activeSection]);

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

  const transactions = stats?.transactionHistory ?? [];
  const hasMoreTransactions =
    transactions.length > TRANSACTION_HISTORY_PREVIEW_ROWS;
  const visibleTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, TRANSACTION_HISTORY_PREVIEW_ROWS);

  function renderSectionContent() {
    switch (activeSection) {
      case "profile":
        return (
          <Section label="Account & Profile">
            <div className="flex items-center gap-4 py-5 border-b border-[#2e2e2e]">
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
                <div className="w-[56px] h-[56px] rounded-full bg-[#1f1f1f] border border-[#2e2e2e] shrink-0" />
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

            <div className={SETTING_ROW}>
              <span className="text-[14px] text-white">Profile</span>
              <button
                type="button"
                onClick={() => openUserProfile({ appearance: reduxUserProfileAppearance })}
                className={BTN_GHOST}
              >
                Edit Profile
              </button>
            </div>
            <div className={SETTING_ROW}>
              <span className="text-[14px] text-white">Password</span>
              <button
                type="button"
                onClick={() => openUserProfile({ appearance: reduxUserProfileAppearance })}
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
                type="button"
                onClick={() => setShowDeleteAccount(true)}
                className="h-9 px-4 text-[14px] text-[#ef4444] border border-[#2e2e2e] rounded-md hover:bg-[#1d1d1d] transition-colors cursor-pointer whitespace-nowrap"
              >
                Delete Account
              </button>
            </div>
          </Section>
        );

      case "billing":
        return (
          <Section label="Credits & Billing">
            <div className="py-5 border-b border-[#2e2e2e]">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161616] border border-[#2e2e2e] rounded-xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-[32px] h-[32px] rounded-md bg-[#1d1d1d] border border-[#2e2e2e] flex items-center justify-center shrink-0">
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
                  type="button"
                  onClick={() => setCreditShopOpen(true)}
                  className={BTN_PRIMARY_SOLID}
                >
                  Purchase Credits
                </button>
              </div>
            </div>

            <div className="py-5 border-b border-[#2e2e2e]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className={SECTION_LABEL}>Transaction History</p>
                {hasMoreTransactions && !showAllTransactions && (
                  <button
                    type="button"
                    onClick={() => setShowAllTransactions(true)}
                    className="text-[12px] font-medium text-[#B07EF0] hover:text-[#c9a0f5] transition-colors cursor-pointer"
                  >
                    View all
                  </button>
                )}
              </div>
              {loadingStats ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[36px] w-full" />
                  ))}
                </div>
              ) : !transactions.length ? (
                <p className="text-[#555555] text-[14px] py-4 text-center">
                  No transactions yet
                </p>
              ) : (
                <div
                  className={
                    showAllTransactions && transactions.length > 10
                      ? "max-h-[400px] overflow-y-auto"
                      : undefined
                  }
                >
                  <TransactionTable transactions={visibleTransactions} />
                </div>
              )}
            </div>

            <div className={SETTING_ROW}>
              <div>
                <span className="text-[14px] text-white">Billing History</span>
                <p className="text-[12px] text-[#555555] mt-[2px]">
                  View invoices and manage payment methods
                </p>
              </div>
              <button
                type="button"
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
        );

      case "storage":
        return (
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
                  {(stats?.imageCount ?? 0).toLocaleString()} photo
                  {stats?.imageCount !== 1 ? "s" : ""}
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
                type="button"
                onClick={() => setShowClearLibrary(true)}
                className="h-9 px-4 text-[14px] text-[#ef4444] border border-[#2e2e2e] rounded-md hover:bg-[#1d1d1d] transition-colors cursor-pointer flex items-center gap-[6px] whitespace-nowrap"
              >
                <Icon name="Trash04" size={16} aria-hidden />
                Clear Library
              </button>
            </div>
          </Section>
        );

      case "about":
        return (
          <Section label="About">
            <div className="py-5 border-b border-[#2e2e2e]">
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
        );
    }
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-[#161616] overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#2e2e2e] bg-[#161616] pl-3 pr-3">
          <Suspense
            fallback={
              <span className="inline-flex shrink-0 items-center gap-2 px-2 py-1.5 text-[13px] font-medium text-[#888888]">
                <Icon name="ChevronLeft" size={20} aria-hidden />
                Back
              </span>
            }
          >
            <SettingsBackButton />
          </Suspense>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-5 py-6">
          <div className="mx-auto w-full max-w-[880px]">
            <h1 className="text-[20px] font-semibold text-white">Settings</h1>

            {/* Mobile: horizontal scroll tab bar */}
            <div className="mt-4 md:hidden -mx-1 overflow-x-auto">
              <div
                className="flex gap-1 px-1 pb-1"
                role="tablist"
                aria-label="Settings sections"
              >
                {SETTINGS_NAV_ITEMS.map((item) => (
                  <SettingsNavItem
                    key={item.id}
                    label={item.label}
                    active={activeSection === item.id}
                    onClick={() => setActiveSection(item.id)}
                    layout="horizontal"
                  />
                ))}
              </div>
            </div>

            {/* Compact nav + content block */}
            <div className="mt-6 flex flex-col md:mt-8 md:flex-row md:items-start md:gap-0">
              {/* Desktop compact nav */}
              <nav
                aria-label="Settings sections"
                className="hidden md:flex w-[172px] shrink-0 flex-col gap-0.5 pr-6"
              >
                {SETTINGS_NAV_ITEMS.map((item) => (
                  <SettingsNavItem
                    key={item.id}
                    label={item.label}
                    active={activeSection === item.id}
                    onClick={() => setActiveSection(item.id)}
                    layout="vertical"
                  />
                ))}
              </nav>

              {/* Content panel */}
              <div className="min-w-0 flex-1">{renderSectionContent()}</div>
            </div>
          </div>
        </main>
      </div>

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
