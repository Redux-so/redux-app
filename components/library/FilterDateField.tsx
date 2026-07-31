"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/Icon";
import { LIBRARY_PANEL_POPOVER } from "@/constants/library-sidebar";

interface FilterDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export default function FilterDateField({
  label,
  value,
  onChange,
}: FilterDateFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());

  useEffect(() => {
    if (selected) setViewMonth(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  function selectDay(day: Date) {
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  const displayValue = selected ? format(selected, "MMM d, yyyy") : "Select date";

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1">
      <span className="text-[11px] font-medium text-[#888888]">{label}</span>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="group flex h-9 w-full items-center gap-2 rounded-lg border border-[#2e2e2e] bg-[#1d1d1d] px-3 text-left transition-colors hover:border-[#3a3a3a] focus:border-[#3a3a3a] focus:outline-none"
      >
        <span
          className={[
            "min-w-0 flex-1 truncate text-[13px]",
            selected ? "text-white" : "text-[#888888]",
          ].join(" ")}
        >
          {displayValue}
        </span>
        <Icon
          name="Calendar"
          size={20}
          className="shrink-0 text-[#888888] transition-colors group-hover:text-white"
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className={`absolute left-0 top-[calc(100%+6px)] z-[60] w-[260px] rounded-lg p-3 ${LIBRARY_PANEL_POPOVER}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] transition-colors hover:text-white cursor-pointer"
              aria-label="Previous month"
            >
              <Icon name="ChevronLeft" size={16} aria-hidden />
            </button>
            <span className="text-[13px] font-medium text-white">
              {format(viewMonth, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] transition-colors hover:text-white cursor-pointer"
              aria-label="Next month"
            >
              <Icon name="ChevronRight" size={16} aria-hidden />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((day) => (
              <span
                key={day}
                className="py-1 text-center text-[10px] font-semibold uppercase text-[#888888]"
              >
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const selectedDay = selected ? isSameDay(day, selected) : false;
              const today = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={[
                    "flex h-8 w-full items-center justify-center rounded-md text-[12px] transition-colors cursor-pointer",
                    selectedDay
                      ? "bg-[#794ADE]/25 font-medium text-[#A688F0]"
                      : inMonth
                        ? "text-white hover:bg-[#1d1d1d]"
                        : "text-[#555555] hover:bg-[#1d1d1d] hover:text-[#888888]",
                    today && !selectedDay
                      ? "ring-1 ring-inset ring-white/[0.12]"
                      : "",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
