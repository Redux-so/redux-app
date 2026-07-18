"use client";

import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/shared/Icon";
import { useState } from "react";
import toast from "react-hot-toast";
import ProfileMenu from "@/components/shared/ProfileMenu";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useEditorPreview } from "@/components/editor/EditorPreviewContext";

const TABS: { label: string; iconName: IconName; href: string }[] = [
  { label: "Library", iconName: "Image01", href: "/library" },
  { label: "Editor", iconName: "Sliders01", href: "/editor" },
] as const;

const EDITOR_HINT_TOAST_ID = "editor-hint";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [navigatingToLibrary, setNavigatingToLibrary] = useState(false);
  const editorPreview = useEditorPreview();

  function showEditorHint() {
    toast.dismiss(EDITOR_HINT_TOAST_ID);
    toast("Select a photo from your library to start editing", {
      id: EDITOR_HINT_TOAST_ID,
      duration: 4000,
    });
  }

  async function handleTabClick(label: string, href: string) {
    if (label === "Editor") {
      if (pathname.startsWith("/editor")) return;
      showEditorHint();
      return;
    }

    if (
      label === "Library" &&
      pathname.startsWith("/editor") &&
      editorPreview?.imageId
    ) {
      setNavigatingToLibrary(true);
      try {
        await editorPreview.savePreview();
      } finally {
        setNavigatingToLibrary(false);
      }
    }

    router.push(href);
  }

  return (
    <nav className="grid h-16 grid-cols-[168px_1fr_168px] items-center bg-black/40 backdrop-blur-2xl px-3 border-t border-white/[0.08] shrink-0">
      <ProfileMenu className="justify-self-start w-[168px] max-w-[180px]" />

      {/* Tabs — centered in the bar (symmetric left/right columns) */}
      <div className="flex justify-center items-center">
        <div className="flex items-center justify-center gap-[3px]">
          {TABS.map(({ label, iconName, href }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            const isLibraryLoading =
              label === "Library" && navigatingToLibrary;

            return (
              <button
                key={label}
                disabled={isLibraryLoading}
                onClick={() => void handleTabClick(label, href)}
                className={[
                  "flex flex-col items-center justify-center gap-1 px-5 py-2 rounded-xl transition-all cursor-pointer min-w-[72px]",
                  isActive
                    ? "bg-[#682FBF]/20 border border-[#682FBF]/40 text-[#B07EF0]"
                    : "border border-transparent text-[#888888] hover:text-[#cccccc] hover:bg-white/[0.05]",
                  isLibraryLoading ? "opacity-60 cursor-wait" : "",
                ].join(" ")}
              >
                {isLibraryLoading ? (
                  <LoadingSpinner size="xs" variant="brand" label="Saving preview" />
                ) : (
                  <Icon name={iconName} size={20} aria-hidden />
                )}
                <span className="text-[12px] leading-none tracking-tight">
                  {isLibraryLoading ? "Saving" : label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mirrors profile column width so tabs stay visually centered in the nav */}
      <div className="w-[168px] justify-self-end shrink-0" aria-hidden />
    </nav>
  );
}
