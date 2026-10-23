import { actionLabel, editorPlanSchema, type EditorAction, type EditorPlan } from "@/lib/editor-actions";
import type { EditorChangeReview } from "@/lib/editor-change-review";

export interface ActionOutcome { action: string; status: "applied" | "needs_input" | "failed"; message: string }
export interface ActionExecution {
  signal: AbortSignal;
  isCurrent: () => boolean;
  isUnchanged?: () => boolean;
  progress: (label: string) => void;
  reviewChanges?: (review: EditorChangeReview) => void;
}

/** Never execute actions concurrently: every step consumes the previous result. */
export async function runEditorPlan(plan: EditorPlan, execution: ActionExecution, adapters: {
  getRevision: () => number;
  execute: (action: EditorAction, index: number, guard: () => boolean) => Promise<string | { needsInput: string }>;
}): Promise<ActionOutcome[]> {
  const parsed = editorPlanSchema.parse(plan);
  const outcomes: ActionOutcome[] = [];
  let revision = adapters.getRevision();
  for (const [index, action] of parsed.actions.entries()) {
    const guard = () => !execution.signal.aborted && execution.isCurrent() && adapters.getRevision() === revision;
    if (!guard()) { outcomes.push({ action: actionLabel(action), status: "failed", message: "Stopped because the image changed or the request was cancelled." }); break; }
    execution.progress(`${actionLabel(action)}...`);
    try {
      const result = await adapters.execute(action, index, guard);
      revision = adapters.getRevision();
      if (typeof result !== "string") {
        outcomes.push({ action: actionLabel(action), status: "needs_input", message: result.needsInput }); break;
      }
      outcomes.push({ action: actionLabel(action), status: "applied", message: result });
    } catch (error) {
      outcomes.push({ action: actionLabel(action), status: "failed", message: error instanceof Error ? error.message : "The tool failed." }); break;
    }
  }
  return outcomes;
}
