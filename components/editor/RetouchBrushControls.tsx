"use client";

import { type ReactNode } from "react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BTN_PRIMARY_PANEL } from "@/lib/button-styles";
import AdjustmentSlider from "./AdjustmentSlider";

import type { RetouchTool } from "@/lib/retouch-brush";

export function RetouchSlider({ label, value, max, unit = "", resetValue = 20, disabled, onChange }: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  resetValue?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <AdjustmentSlider label={label} value={value} min={1} max={max}
      disabled={disabled} onChange={onChange} className="py-3.5"
      resetValue={resetValue} formatValue={(current) => `${current}${unit}`} />
  );
}

export default function RetouchBrushControls({ tool, instruction, size, onSizeChange, loading, onCancel, onConfirm, children }: {
  tool: RetouchTool;
  instruction: string;
  size: number;
  onSizeChange: (size: number) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pt-1" role="group" aria-label={`${tool} brush controls`}>
      <RetouchSlider label="Brush size" value={size} max={200} unit=" px" disabled={loading} onChange={onSizeChange} />
      {children}
      <p className="text-[12px] text-[#888888] leading-relaxed">{instruction}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={loading}
          className="flex-1 h-[34px] bg-[#1d1d1d] border border-[#262626] rounded-md text-[13px] text-white hover:border-[#2e2e2e] transition-colors cursor-pointer disabled:opacity-40">
          Cancel
        </button>
        <button type="button" onClick={() => void onConfirm()} disabled={loading} className={BTN_PRIMARY_PANEL}>
          {loading ? <LoadingSpinner size="sm" label={`Processing ${tool}`} /> : "Confirm"}
        </button>
      </div>
    </div>
  );
}
