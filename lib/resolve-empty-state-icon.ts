import type { IconName } from "@/components/shared/Icon";

/** Pick a contextual icon for library grid / search empty messages. */
export function resolveLibraryEmptyIcon(
  message: string,
  viewMode: "library" | "trash",
): IconName {
  const lower = message.toLowerCase();

  if (viewMode === "trash" || lower.includes("trash")) {
    return "Trash04";
  }
  if (lower.includes("search") || lower.includes("matching your")) {
    return "SearchMd";
  }
  if (lower.includes("favorite")) {
    return "Heart";
  }
  if (lower.includes("recent") || lower.includes("last 7 days")) {
    return "ClockRewind";
  }
  if (lower.includes("album")) {
    return "Folder";
  }
  if (lower.includes("filter")) {
    return "FilterFunnel02";
  }
  if (lower.includes("upload your first")) {
    return "Image05";
  }

  return "Image01";
}
