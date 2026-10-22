import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import { httpImageUrlSchema, maskBase64Schema, adjustmentsRecordSchema, parseJsonRequest } from "@/lib/api-validation";
import { editorPlanSchema, isRemoteAction, planCost } from "@/lib/editor-actions";
import { dispatchChatTool } from "@/lib/chat-tool-dispatch";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { cleanChatText } from "@/lib/chat-history-shared";

export const maxDuration = 300;

const bodySchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("approve"), turnId: z.string().uuid() }).strict(),
  z.object({ phase: z.literal("cancel"), turnId: z.string().uuid() }).strict(),
  z.object({ phase: z.literal("execute"), turnId: z.string().uuid(), index: z.number().int().min(0).max(7),
    imageUrl: httpImageUrlSchema, maskBase64: maskBase64Schema.optional(),
    currentAdjustments: adjustmentsRecordSchema.optional() }).strict(),
  z.object({ phase: z.literal("finish"), turnId: z.string().uuid(), message: z.string().min(1).max(12000) }).strict(),
]);

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const parsed = await parseJsonRequest(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const run = await prisma.chatToolRun.findFirst({ where: { turnId: input.turnId,
    turn: { mode: "agent", image: { userId: auth.user.id, deletedAt: null } } }, include: { turn: true } });
  if (!run) return Response.json({ error: "Tool request not found" }, { status: 404 });
  const plan = editorPlanSchema.parse(run.plan);

  if (input.phase === "cancel") {
    const cancelled = await prisma.chatToolRun.updateMany({ where: { turnId: run.turnId, status: "pending" }, data: { status: "cancelled" } });
    if (!cancelled.count) return Response.json({ error: "This request has already started" }, { status: 409 });
    await prisma.chatTurn.update({ where: { id: run.turnId }, data: { status: "complete", assistantText: "Edits cancelled. No tools were run." } });
    return Response.json({ ok: true });
  }
  if (input.phase === "approve") {
    if (run.status !== "pending") return Response.json({ error: "This request has already started or is no longer available" }, { status: 409 });
    if (auth.user.creditBalance < planCost(plan)) return Response.json({ error: "Insufficient credits for these tools" }, { status: 402 });
    const approved = await prisma.chatToolRun.updateMany({ where: { turnId: run.turnId, status: "pending" }, data: { status: "running" } });
    if (!approved.count) return Response.json({ error: "This request has already started or was cancelled" }, { status: 409 });
    return Response.json({ ok: true });
  }
  if (input.phase === "finish") {
    if (!["pending", "running"].includes(run.status)) return Response.json({ error: "This request is already finished" }, { status: 409 });
    await prisma.$transaction([
      prisma.chatToolRun.update({ where: { turnId: run.turnId }, data: { status: "complete" } }),
      prisma.chatTurn.update({ where: { id: run.turnId }, data: { status: "complete", assistantText: cleanChatText(input.message) } }),
    ]);
    return Response.json({ ok: true });
  }
  if (run.status !== "running") return Response.json({ error: "Approve this tool request before running it" }, { status: 409 });

  const action = plan.actions[input.index];
  if (!action || !isRemoteAction(action)) return Response.json({ error: "Invalid tool step" }, { status: 400 });
  for (const [index, previous] of plan.actions.entries()) {
    if (index >= input.index) break;
    if (!isRemoteAction(previous)) continue;
    const step = await prisma.chatToolStep.findUnique({ where: { id: `${run.turnId}:${index}` } });
    if (step?.status !== "complete") return Response.json({ error: "Finish the earlier tool before continuing" }, { status: 409 });
  }
  const image = await assertUserOwnsImageUrl(auth.user.id, input.imageUrl);
  if (!image || image.id !== run.turn.imageId) return Response.json({ error: "Image not found" }, { status: 404 });
  if (action.type === "apply_selection" && !input.maskBase64) return Response.json({ error: "Paint a selection first" }, { status: 400 });
  const id = `${run.turnId}:${input.index}`;
  const cached = await prisma.chatToolStep.findUnique({ where: { id } });
  if (cached) {
    if (cached.status === "complete") return Response.json(cached.result);
    return Response.json({ error: "This tool already started and will not run or charge again. Check the image and credit balance before submitting a new request." }, { status: 409 });
  }
  // A unique claim survives refreshes, duplicate HTTP requests, and process exits.
  try { await prisma.chatToolStep.create({ data: { id, turnId: run.turnId, index: input.index } }); }
  catch { return Response.json({ error: "This tool already started" }, { status: 409 }); }
  try {
    const response = await dispatchChatTool(request, action, {
      imageId: run.turn.imageId, imageUrl: input.imageUrl, maskBase64: input.maskBase64, currentAdjustments: input.currentAdjustments,
    }, run.turn.attachmentUrl);
    const result = await response.json();
    await prisma.chatToolStep.update({ where: { id }, data: { status: response.ok ? "complete" : "failed", result: result as Prisma.InputJsonValue } });
    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error("[chat/tools] Tool outcome uncertain:", error);
    // Do not retry or refund blindly: the actual endpoint owns its charge/refund.
    return Response.json({ error: "Could not confirm the tool result. This operation will not be retried automatically." }, { status: 503 });
  }
}
