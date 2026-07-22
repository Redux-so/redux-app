export type SettingsSectionId = "profile" | "billing" | "storage" | "about";

export const SETTINGS_NAV_ITEMS: {
  id: SettingsSectionId;
  label: string;
}[] = [
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Billing & Credits" },
  { id: "storage", label: "Storage" },
  { id: "about", label: "About" },
];

export const SETTINGS_SECTION_TITLES: Record<SettingsSectionId, string> = {
  profile: "Profile",
  billing: "Billing & Credits",
  storage: "Storage",
  about: "About",
};

/** Preview rows before "View all" in transaction history. */
export const TRANSACTION_HISTORY_PREVIEW_ROWS = 5;
