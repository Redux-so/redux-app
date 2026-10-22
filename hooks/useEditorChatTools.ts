"use client";

import type { RefObject } from "react";
import { actionLabel, actionResultMessage, isRemoteAction, type ChatToolPlan, type EditorAction, type EditorToolContext } from "@/lib/editor-actions";
import { describeOutcomes, runEditorPlan, type ActionExecution } from "@/lib/editor-action-runner";
import { hasImageTransform, transformedDimensions } from "@/lib/image-transform";
import { transformedSource } from "@/lib/canvas-image-geometry";
import { renderEditorPayload } from "@/lib/interactive-image-preview";
import type { EditorHistoryState } from "@/lib/editor-history";
import type { AdjustmentPanelChatControls } from "@/components/editor/AdjustmentPanel";
import type { Adjustments } from "@/constants/adjustments";

export async function chatToolsRequest(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/ai/chat/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not run this tool");
  return result;
}

export function useEditorChatTools(options: {
  imageId?: string; originalUrl: string | null; width: number; height: number;
  ready: boolean; isCropping: boolean;
  getState: () => EditorHistoryState; getRevision: () => number; getSelections: () => string[];
  brushSizes: { blur: number; eraser: number; heal: number };
  clearSelections: () => void;
  versions: { id: string; label: string }[];
  controls: RefObject<AdjustmentPanelChatControls | null>;
  patch: (values: Partial<Adjustments>) => boolean;
  rotateCW: () => void; rotateCCW: () => void; flipH: () => void; flipV: () => void;
  straighten: (degrees: number) => void;
  resize: (width: number, height: number, guard: () => boolean, region?: { x: number; y: number; width: number; height: number }) => Promise<string | null>;
  commitPixels: (data: string | null, guard: () => boolean, label: string) => void;
  exportMasks: Record<"blur" | "eraser" | "heal", () => Promise<string>>;
  reload: (url: string, guard: () => boolean, label: string, resetTransform?: boolean) => Promise<boolean>;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  revert: (id: string) => Promise<void>;
  save: () => Promise<unknown>;
}) {
  function context(): EditorToolContext | undefined {
    if (!options.ready) return;
    const state = options.getState();
    const dims = transformedDimensions(state.workingWidth ?? options.width, state.workingHeight ?? options.height, state.transform);
    return { ...dims, transform: state.transform, selections: options.getSelections(),
      brushSizes: options.brushSizes, blurIntensity: options.controls.current?.getBlurIntensity?.() ?? 30,
      versions: [...options.versions.filter((v) => v.id === "original"), ...options.versions.filter((v) => v.id !== "original").slice(-99)] };
  }

  async function workspaceImage(): Promise<string> {
    if (!options.ready) throw new Error("Wait for the image to finish loading.");
    const state = options.getState();
    const rendered = await renderEditorPayload({ adjustments: state.sliders, transform: state.transform,
      originalUrl: options.originalUrl, storedPreviewUrl: null, baseImageUrl: state.workingImageUrl ?? options.originalUrl, imageBase64: null });
    const image = new Image();
    image.src = `data:image/png;base64,${rendered.imageBase64}`;
    await image.decode();
    return transformedSource(image, state.transform).toDataURL("image/png");
  }

  async function execute(plan: ChatToolPlan, execution: ActionExecution): Promise<string> {
    if (!options.ready || !options.imageId) throw new Error("Wait for the image to load before editing.");
    if (!execution.isCurrent() || execution.isUnchanged?.() === false || execution.signal.aborted) throw new Error("The image changed while this request was being prepared. Send a new request.");
    if (options.isCropping) throw new Error("Confirm or cancel the current crop before running chat edits.");
    // Preflight every selection before approval/provider calls. Missing masks never cost credits.
    const missing = plan.actions.find((a) => a.type === "apply_selection" && !options.getSelections().includes(a.tool));
    if (missing?.type === "apply_selection") {
      options.controls.current?.openBrush(missing.tool, undefined, missing.intensity);
      const message = `Paint over the area to ${missing.tool === "eraser" ? "erase" : missing.tool}, then confirm in the panel or ask me to apply it. No tools were charged.`;
      await chatToolsRequest({ phase: "finish", turnId: plan.turnId, message }, execution.signal);
      return message;
    }
    await chatToolsRequest({ phase: "approve", turnId: plan.turnId }, execution.signal);
    if (!execution.isCurrent() || execution.isUnchanged?.() === false || execution.signal.aborted) throw new Error("The image changed. Send a new request.");
    const outcomes = await runEditorPlan({ actions: plan.actions }, execution, {
      getRevision: options.getRevision,
      async execute(action: EditorAction, index, guard) {
        const current = options.getState();
        const label = actionLabel(action);
        // Selections are aligned to source pixels; do not crop/rotate underneath them.
        if (options.getSelections().length && !["apply_selection", "brush"].includes(action.type)) throw new Error("Confirm or cancel your painted selection before other edits.");
        if (isRemoteAction(action)) {
          let source = current.workingImageUrl ?? options.originalUrl;
          if (!source) throw new Error("No image is open");
          let maskBase64: string | undefined;
          if (action.type === "apply_selection") maskBase64 = await options.exportMasks[action.tool]();
          // Expansion directions are relative to the photo the user sees. Bake
          // geometry (not sliders) once and reset it only after a successful result.
          const bakeTransform = action.type === "generative_fill" && hasImageTransform(current.transform);
          if (bakeTransform) {
            const image = new Image(); image.crossOrigin = "anonymous"; image.src = source;
            await image.decode();
            source = transformedSource(image, current.transform).toDataURL("image/png");
          }
          if (!guard()) throw new Error("The image changed before this tool started.");
          // Native crops are inline until saved. Register an immutable source using
          // the existing ownership-checked upload path before calling paid routes.
          if (source.startsWith("data:")) {
            const response = await fetch("/api/images/versions", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageId: options.imageId, adjustments: {}, sourceOnly: true, imageBase64: source.split(",")[1] }), signal: execution.signal });
            if (!response.ok) throw new Error("Could not prepare the current image. No tool was run.");
            source = (await response.json()).sourceUrl;
          }
          if (!guard()) throw new Error("The image changed before this tool started.");
          // Once a provider starts, allow the server to record the result even if
          // the browser disconnects. The guard still prevents applying stale pixels.
          const result = await chatToolsRequest({ phase: "execute", turnId: plan.turnId, index, imageUrl: source,
            maskBase64, currentAdjustments: current.sliders });
          if (!guard()) throw new Error("The tool finished, but the image changed. Its result was not applied; its tool charge still applies.");
          if (result.resultUrl) {
            if (!await options.reload(result.resultUrl, guard, label, bakeTransform)) throw new Error("The result could not be applied to the current image.");
            if (action.type === "apply_selection") { options.clearSelections(); options.controls.current?.closeBrush(); }
          } else if (result.adjustments) options.patch(result.adjustments);
          else throw new Error("The tool returned no usable edit.");
          return actionResultMessage(action, result.adjustments);
        }
        switch (action.type) {
          case "adjust": options.patch(action.values); break;
          case "rotate": if (action.degrees === -90) options.rotateCCW(); else { options.rotateCW(); if (action.degrees === 180) options.rotateCW(); } break;
          case "flip": (action.axis === "horizontal" ? options.flipH : options.flipV)(); break;
          case "straighten": options.straighten(action.degrees); break;
          case "crop": case "crop_aspect": case "resize": {
            const dims = transformedDimensions(current.workingWidth ?? options.width, current.workingHeight ?? options.height, current.transform);
            let width = dims.width, height = dims.height;
            if (action.type === "resize") {
              width = action.width; height = action.height;
              if (width > dims.width || height > dims.height) throw new Error("The panel's resize tool crops at native resolution. Use generative fill to extend the image.");
            } else if (action.type === "crop_aspect") {
              const ratio = action.width / action.height;
              if (width / height > ratio) width = Math.round(height * ratio); else height = Math.round(width / ratio);
            }
            const pixels = await options.resize(width, height, guard, action.type === "crop" ? action.region : undefined);
            if (!pixels || !guard()) throw new Error("The image changed before the crop completed.");
            options.commitPixels(pixels, guard, label); break;
          }
          case "brush":
            options.controls.current?.openBrush(action.tool, action.size, action.intensity);
            return { needsInput: `The ${action.tool} brush is ready at ${action.size}px. Paint the area, then confirm in the panel or ask me to apply the selection.` };
          case "undo": if (!options.canUndo) throw new Error("There is nothing to undo."); options.undo(); break;
          case "redo": if (!options.canRedo) throw new Error("There is nothing to redo."); options.redo(); break;
          case "revert": await options.revert(action.versionId); break;
        }
        return actionResultMessage(action);
      },
    });
    let message = describeOutcomes(outcomes);
    if (outcomes.some((o) => o.status === "applied")) {
      try { if (!await options.save()) message += "\n\nYour edits are visible, but saving failed. Save again before leaving."; }
      catch { message += "\n\nYour edits are visible, but saving failed. Save again before leaving."; }
    }
    // Persist actual outcomes, not the model's intended edits. Never replay on reload.
    try { await chatToolsRequest({ phase: "finish", turnId: plan.turnId, message }); }
    catch { message += "\n\nCould not save this tool report. Do not repeat paid edits without checking the image and credit balance."; }
    return message;
  }
  return { context, execute, workspaceImage };
}
