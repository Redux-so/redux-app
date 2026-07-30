"use client";

import { useEffect, useRef } from "react";

import FilterDateField from "@/components/library/FilterDateField";
import type { LibraryFileTypeKey } from "@/constants/image-formats";
import { LIBRARY_PANEL_POPOVER } from "@/constants/library-sidebar";
import { Icon } from "@/components/shared/Icon";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import {
  countActiveLibraryFilters,
  DEFAULT_LIBRARY_FILTERS,
  LIBRARY_RECENTLY_ADDED_DATE_PRESET,
  type DateFilterPreset,
  type EditStatusFilter,
  type LibraryFilters,
  type OrientationFilter,
} from "@/lib/library-filters";

interface LibraryFiltersPopoverProps {
  open: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  draft: LibraryFilters;
  applied: LibraryFilters;
  onDraftChange: (next: LibraryFilters) => void;
  onApply: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

const SECTION_LABEL =
  "text-[12px] font-semibold uppercase tracking-wide text-[#888888]";

const OPTION_LABEL =
  "flex cursor-pointer items-center gap-2.5 py-1.5 text-[13px] text-[#cccccc] hover:text-white transition-colors";

const CHOICE_BOX =
  "flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors";
const CHOICE_IDLE = "border-[#3a3a3a] bg-[#1d1d1d]";
const CHOICE_SELECTED = "border-[#8758ed] bg-[#8758ed]";

function Divider() {
  return <div className="my-3 border-t border-white/[0.08]" />;
}

function RadioOption({
  name,
  checked,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={OPTION_LABEL}>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden
        className={[
          CHOICE_BOX,
          "rounded-full",
          checked ? CHOICE_SELECTED : CHOICE_IDLE,
        ].join(" ")}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />}
      </span>
      {label}
    </label>
  );
}

function CheckboxOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={OPTION_LABEL}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden
        className={[
          CHOICE_BOX,
          "rounded-[4px]",
          checked ? `${CHOICE_SELECTED} text-white` : `${CHOICE_IDLE} text-transparent`,
        ].join(" ")}
      >
        <Icon name="Check" size={12} strokeWidth={2.5} aria-hidden />
      </span>
      {label}
    </label>
  );
}

export default function LibraryFiltersPopover({
  open,
  containerRef,
  draft,
  applied,
  onDraftChange,
  onApply,
  onClearAll,
  onClose,
}: LibraryFiltersPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose, containerRef]);

  if (!open) return null;

  const activeCount = countActiveLibraryFilters(applied);

  function setDatePreset(datePreset: DateFilterPreset) {
    onDraftChange({ ...draft, datePreset });
  }

  function toggleFileType(type: LibraryFileTypeKey) {
    const next = draft.fileTypes.includes(type)
      ? draft.fileTypes.filter((t) => t !== type)
      : [...draft.fileTypes, type];
    onDraftChange({ ...draft, fileTypes: next });
  }

  function toggleOrientation(orientation: OrientationFilter) {
    const next = draft.orientations.includes(orientation)
      ? draft.orientations.filter((o) => o !== orientation)
      : [...draft.orientations, orientation];
    onDraftChange({ ...draft, orientations: next });
  }

  return (
    <div
      ref={panelRef}
      className={`absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-lg p-4 ${LIBRARY_PANEL_POPOVER}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-medium text-white">Filters</span>
        {activeCount > 0 && (
          <span className="text-[12px] text-[#888888]">
            {activeCount} active
          </span>
        )}
      </div>

      {/* Date presets are granular popover filters only — Recently Added and Favorites live in the sidebar. */}
      <div>
        <p className={SECTION_LABEL}>Date</p>
        <div className="mt-2 flex flex-col">
          <RadioOption
            name="date-filter"
            checked={draft.datePreset === "anytime"}
            label="Anytime"
            onChange={() => setDatePreset("anytime")}
          />
          <RadioOption
            name="date-filter"
            checked={draft.datePreset === "today"}
            label="Today"
            onChange={() => setDatePreset("today")}
          />
          <RadioOption
            name="date-filter"
            checked={draft.datePreset === LIBRARY_RECENTLY_ADDED_DATE_PRESET}
            label="Last 7 days"
            onChange={() => setDatePreset(LIBRARY_RECENTLY_ADDED_DATE_PRESET)}
          />
          <RadioOption
            name="date-filter"
            checked={draft.datePreset === "last30"}
            label="Last 30 days"
            onChange={() => setDatePreset("last30")}
          />
          <RadioOption
            name="date-filter"
            checked={draft.datePreset === "custom"}
            label="Custom date range"
            onChange={() => setDatePreset("custom")}
          />
        </div>
        {draft.datePreset === "custom" && (
          <div className="mt-3 flex flex-col gap-2">
            <FilterDateField
              label="Start date"
              value={draft.customStartDate}
              onChange={(customStartDate) =>
                onDraftChange({ ...draft, customStartDate })
              }
            />
            <FilterDateField
              label="End date"
              value={draft.customEndDate}
              onChange={(customEndDate) =>
                onDraftChange({ ...draft, customEndDate })
              }
            />
          </div>
        )}
      </div>

      <Divider />

      {/* Edit Status */}
      <div>
        <p className={SECTION_LABEL}>Edit Status</p>
        <div className="mt-2 flex flex-col">
          {(
            [
              ["all", "All photos"],
              ["edited", "Edited"],
              ["unedited", "Unedited"],
            ] as const
          ).map(([value, label]) => (
            <RadioOption
              key={value}
              name="edit-status-filter"
              checked={draft.editStatus === value}
              label={label}
              onChange={() => onDraftChange({ ...draft, editStatus: value })}
            />
          ))}
        </div>
      </div>

      <Divider />

      {/* File Type */}
      <div>
        <p className={SECTION_LABEL}>File Type</p>
        <div className="mt-2 flex flex-col">
          {(
            [
              ["jpeg", "JPEG"],
              ["png", "PNG"],
              ["tiff", "TIFF"],
              ["raw", "RAW"],
            ] as const
          ).map(([value, label]) => (
            <CheckboxOption
              key={value}
              checked={draft.fileTypes.includes(value)}
              label={label}
              onChange={() => toggleFileType(value)}
            />
          ))}
        </div>
      </div>

      <Divider />

      {/* Orientation */}
      <div>
        <p className={SECTION_LABEL}>Orientation</p>
        <div className="mt-2 flex flex-col">
          {(
            [
              ["landscape", "Landscape"],
              ["portrait", "Portrait"],
              ["square", "Square"],
            ] as const
          ).map(([value, label]) => (
            <CheckboxOption
              key={value}
              checked={draft.orientations.includes(value)}
              label={label}
              onChange={() => toggleOrientation(value)}
            />
          ))}
        </div>
      </div>

      <Divider />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClearAll}
          className="h-9 px-3 text-[13px] text-[#888888] hover:text-white transition-colors cursor-pointer"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onApply}
          className={`${BTN_PRIMARY_SOLID} shrink-0`}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
