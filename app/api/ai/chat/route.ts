import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ImageBlockParam, MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic, formatAdjustmentsForPrompt } from "@/lib/anthropic";
import { cleanChatText } from "@/lib/chat-history-shared";
import { CHAT_PROGRESS_LABELS, createChatProgressParser } from "@/lib/chat-progress";
import { ownsChatImage, readChatContext } from "@/lib/chat-history";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import type { AdjustmentKey } from "@/constants/adjustments";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { USAGE_RING_CONFIG } from "@/constants/usage-ring";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { ASK_SWITCH_TO_AGENT_NUDGE } from "@/constants/chat-interaction-mode";
import {
  allowChatAdjustmentsForTurn,
  askModeNudgeMissing,
  type ChatHistoryMessage,
} from "@/lib/chat-edit-intent";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";
import {
  fetchChatImageBase64,
  isChatImageMediaType,
  type ChatImageMediaType,
} from "@/lib/chat-image-context";
import { prepareChatVisionBase64 } from "@/lib/chat-image-vision-server";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import {
  API_LIMITS,
  chatRequestBodySchema,
  parseJsonRequest,
} from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { ANTHROPIC_DEFAULT_MODEL } from "@/constants/ai-models";
import { CREDIT_COSTS } from "@/constants/credits";
import { EDIT_PHOTO_TOOL, editorPlanSchema, planCost, type ChatToolPlan } from "@/lib/editor-actions";

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
type SseEvent =
  | {
      type: "meta";
      lifetimeFreeRemaining: number;
      lifetimeFreeUsed: number;
      creditBalanceAfter: number;
    }
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "tools"; plan: ChatToolPlan }
  | { type: "interrupted" }
  | { type: "history_error" }
  | { type: "done" };

function encodeEvent(data: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

const FREE_HOURLY_LIMIT = 10;
const CREDIT_HOURLY_LIMIT = 60;

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------
function buildAnthropicMessages(
  history: ChatHistoryMessage[],
  userContent: (ImageBlockParam | TextBlockParam)[],
): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const entry of history.slice(-API_LIMITS.CHAT_HISTORY_MAX_MESSAGES)) {
    const content = entry.content.trim();
    if (!content) continue;
    messages.push({ role: entry.role, content });
  }

  messages.push({ role: "user", content: userContent });
  return messages;
}

async function resolveWorkspaceImage(
  userId: string,
  workspaceImageUrl: string,
  imageId?: string,
): Promise<{ base64: string; mediaType: ChatImageMediaType } | null> {
  if (workspaceImageUrl.startsWith("data:")) {
    if (!imageId) return null;
    const owned = await prisma.image.findFirst({
      where: { id: imageId, userId, deletedAt: null },
    });
    if (!owned) return null;
    return fetchChatImageBase64(workspaceImageUrl);
  }

  const owned = await assertUserOwnsImageUrl(userId, workspaceImageUrl);
  if (!owned) return null;
  return fetchChatImageBase64(workspaceImageUrl);
}

function pushImageBlock(
  blocks: (ImageBlockParam | TextBlockParam)[],
  base64: string,
  mediaType: string,
) {
  const media: ChatImageMediaType = isChatImageMediaType(mediaType)
    ? mediaType
    : "image/jpeg";

  blocks.push({
    type: "image",
    source: { type: "base64", media_type: media, data: base64 },
  });
}

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const parsed = await parseJsonRequest(request, chatRequestBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const {
    userMessage,
    turnId: requestedTurnId,
    adjustments,
    conversationHistory,
    imageId,
    workspaceImageUrl,
    imageBase64,
    imageMediaType,
    chatInteractionMode,
    toolsEnabled,
    editorContext,
  } = parsed.data;

  if (imageId && !await ownsChatImage(imageId, user.id)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // ── Find user ─────────────────────────────────────────────────────────────
  // ── Block only when lifetime free is used up AND there are no credits left.
  // While lifetimeFreeAI < 20, messages are free (lifetime counter increments).
  // Once lifetimeFreeAI reaches 20, each message deducts 1 credit with no extra step.
  if (user.lifetimeFreeAI >= USAGE_RING_CONFIG.freeChatAllowance && user.creditBalance === 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  /** True while the user still has lifetime free messages (before the 21st send). */
  const onFreeTier = user.lifetimeFreeAI < USAGE_RING_CONFIG.freeChatAllowance;

  // ── Rate limiting (per-minute burst, then hourly) ───────────────────────
  if (onFreeTier) {
    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "chat_free",
      RATE_LIMIT_MINUTE.chat_free,
    );
    const minuteDenied = rateLimitDeniedResponse(minuteLimit);
    if (minuteDenied) return minuteDenied;

    const hourly = await checkRateLimit(user.id, "chat_free", FREE_HOURLY_LIMIT);
    const hourlyDenied = rateLimitDeniedResponse(hourly);
    if (hourlyDenied) return hourlyDenied;
  } else {
    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "chat_credit",
      RATE_LIMIT_MINUTE.chat_credit,
    );
    const minuteDenied = rateLimitDeniedResponse(minuteLimit);
    if (minuteDenied) return minuteDenied;

    const hourly = await checkRateLimit(user.id, "chat_credit", CREDIT_HOURLY_LIMIT);
    const hourlyDenied = rateLimitDeniedResponse(hourly);
    if (hourlyDenied) return hourlyDenied;
  }

  // ── Build Anthropic message content (before billing — invalid attachments → 400) ──
  const adjustmentsContext = formatAdjustmentsForPrompt(
    adjustments as Record<AdjustmentKey, number>,
  );

  const userContent: (ImageBlockParam | TextBlockParam)[] = [];

  if (workspaceImageUrl?.trim()) {
    try {
      const workspaceImage = await resolveWorkspaceImage(
        user.id,
        workspaceImageUrl.trim(),
        imageId,
      );
      if (workspaceImage) {
        const prepared = await prepareChatVisionBase64(workspaceImage.base64);
        pushImageBlock(userContent, prepared.base64, prepared.mediaType);
      }
    } catch (err) {
      console.error("[/api/ai/chat] Failed to load workspace image:", err);
    }
  }

  let attachment: { secureUrl: string; publicId: string } | undefined;
  let preparedAttachment: Awaited<ReturnType<typeof prepareChatVisionBase64>> | undefined;
  if (imageBase64 && imageMediaType) {
    try {
      const prepared = await prepareChatVisionBase64(imageBase64);
      preparedAttachment = prepared;
      pushImageBlock(userContent, prepared.base64, prepared.mediaType);
    } catch (err) {
      console.error("[/api/ai/chat] Failed to prepare attachment:", err);
      return NextResponse.json(
        { error: "Could not process the attached image. Try a smaller JPEG or PNG." },
        { status: 400 },
      );
    }
  }

  userContent.push({
    type: "text",
    text: `${userMessage.trim()}\n\n${adjustmentsContext}${editorContext ? `\nEditor context (coordinates refer to the transformed image): ${JSON.stringify(editorContext)}` : ""}`,
  });

  const turnId = requestedTurnId ?? randomUUID();
  let durableTurn = false;
  let context = conversationHistory;
  if (imageId) {
    try {
      if (await prisma.chatTurn.findUnique({ where: { id: turnId }, select: { id: true } })) {
        return NextResponse.json({ error: "This message was already submitted. Reopen the image to load its response." }, { status: 409 });
      }
      context = await readChatContext(imageId, user.id);
      if (preparedAttachment) {
        attachment = await uploadToCloudinary(Buffer.from(preparedAttachment.base64, "base64"), `chat_${imageId}_${turnId}.png`);
      }
      await prisma.chatTurn.create({ data: {
        id: turnId, imageId, userText: userMessage, mode: chatInteractionMode,
        attachmentUrl: attachment?.secureUrl, attachmentPublicId: attachment?.publicId,
      } });
      durableTurn = true;
    } catch (error) {
      if (attachment) await deleteFromCloudinary(attachment.publicId).catch(() => {});
      console.error("[/api/ai/chat] Could not save user message:", error);
      return NextResponse.json({ error: "Could not save your message. Please try again." }, { status: 503 });
    }
  }
  const anthropicMessages = buildAnthropicMessages(context, userContent);
  const allowAdjustments = allowChatAdjustmentsForTurn(chatInteractionMode);
  const enableTools = toolsEnabled && allowAdjustments && durableTurn;

  // ── Consume free message or credit ───────────────────────────────────────
  let lifetimeFreeRemaining: number;
  let lifetimeFreeUsed: number;
  let creditBalanceAfter: number;
  let chatCreditCharged = false;

  try {
    if (onFreeTier) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lifetimeFreeAI: { increment: 1 } },
      });
      lifetimeFreeUsed = user.lifetimeFreeAI + 1;
      lifetimeFreeRemaining = Math.max(
        0,
        USAGE_RING_CONFIG.freeChatAllowance - lifetimeFreeUsed,
      );
      creditBalanceAfter = user.creditBalance;
    } else {
      // Paid path: lifetime free already exhausted — charge 1 credit per message.
      if (user.creditBalance < CREDIT_COSTS.chat_message) {
        if (durableTurn) await prisma.chatTurn.update({ where: { id: turnId }, data: { status: "interrupted" } });
        return insufficientCreditsResponse();
      }
      const charge = await chargeCreditFeature({
        userId: user.id,
        feature: "chat_message",
      });
      if (!charge.ok) {
        if (durableTurn) await prisma.chatTurn.update({ where: { id: turnId }, data: { status: "interrupted" } });
        return insufficientCreditsResponse();
      }
      chatCreditCharged = true;
      lifetimeFreeRemaining = 0;
      lifetimeFreeUsed = user.lifetimeFreeAI;
      creditBalanceAfter = charge.balanceAfter;
    }

  } catch (error) {
    if (durableTurn) await prisma.chatTurn.update({ where: { id: turnId }, data: { status: "interrupted" } }).catch(() => {});
    console.error("[/api/ai/chat] Could not start chat:", error);
    return NextResponse.json({ error: "Could not start chat. Please try again." }, { status: 503 });
  }

  // ── Stream response ───────────────────────────────────────────────────────
  let disconnected = request.signal.aborted;
  let generation: ReturnType<typeof anthropic.messages.stream> | undefined;
  const onDisconnect = () => {
    disconnected = true;
    generation?.abort();
  };
  request.signal.addEventListener("abort", onDisconnect);
  const stream = new ReadableStream({
    cancel() { onDisconnect(); },
    async start(controller) {
      const emit = (event: SseEvent) => {
        if (disconnected) return;
        try { controller.enqueue(encodeEvent(event)); }
        catch { onDisconnect(); }
      };
      emit({ type: "meta", lifetimeFreeRemaining, lifetimeFreeUsed, creditBalanceAfter });
      emit({ type: "progress", text: CHAT_PROGRESS_LABELS.waiting });

      let fullText = "";
      let toolInput = "";
      let toolCalls = 0;
      let toolBlock = -1;
      let truncated = false;
      const progressParser = createChatProgressParser();
      let lastCheckpoint = Date.now();
      async function persist(status: "streaming" | "complete" | "interrupted") {
        if (!durableTurn) return;
        const data = { assistantText: cleanChatText(fullText), status };
        // One retry handles a short connection drop without rewriting the whole thread.
        try { await prisma.chatTurn.update({ where: { id: turnId }, data }); }
        catch { await prisma.chatTurn.update({ where: { id: turnId }, data }); }
      }

      try {
        if (disconnected) throw new Error("Chat interrupted");
        const claudeStream = anthropic.messages.stream({
          model: ANTHROPIC_DEFAULT_MODEL,
          max_tokens: enableTools ? 2048 : 1024,
          system: buildChatSystemPrompt(chatInteractionMode, enableTools),
          messages: anthropicMessages,
          ...(enableTools ? { tools: [EDIT_PHOTO_TOOL], tool_choice: { type: "auto" as const, disable_parallel_tool_use: true } } : {}),
        });

        generation = claudeStream;
        if (disconnected) claudeStream.abort();
        for await (const event of claudeStream) {
          if (event.type === "message_delta" && event.delta.stop_reason === "max_tokens") truncated = true;
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            if (!enableTools || event.content_block.name !== "edit_photo" || ++toolCalls > 1) throw new Error("Invalid editor tool request");
            toolBlock = event.index;
          }
          if (event.type === "content_block_delta" && event.index === toolBlock && event.delta.type === "input_json_delta") toolInput += event.delta.partial_json;
          if (event.type === "message_start") {
            emit({ type: "progress", text: CHAT_PROGRESS_LABELS.thinking });
          }
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            for (const update of progressParser.push(chunk)) emit(update);
            if (Date.now() - lastCheckpoint >= 2000) {
              await persist("streaming");
              lastCheckpoint = Date.now();
            }
          }
        }

        if (disconnected) throw new Error("Chat interrupted");
        if (truncated) throw new Error("The response was incomplete; no tools were run");
        for (const update of progressParser.finish()) emit(update);
        if (chatInteractionMode === "ask" && askModeNudgeMissing(fullText)) {
          const suffix = `\n\n${ASK_SWITCH_TO_AGENT_NUDGE}`;
          fullText += suffix;
          emit({ type: "text", text: suffix });
        }
        if (toolCalls) {
          const plan = editorPlanSchema.parse(JSON.parse(toolInput));
          for (const action of plan.actions) {
            if (action.type === "apply_selection" && action.tool === "blur" && action.intensity === undefined) action.intensity = editorContext?.blurIntensity ?? 30;
            if (action.type === "revert" && !editorContext?.versions.some((v) => v.id === action.versionId)) throw new Error("This version is not available in the current history");
          }
          if (plan.actions.some((a) => a.type === "style_match") && !attachment) throw new Error("Attach a reference image for style matching");
          await prisma.chatToolRun.create({ data: { turnId, plan: JSON.parse(JSON.stringify(plan)) } });
          fullText = "Edits are ready. They have not been confirmed as applied. If this request was interrupted, send a new message to continue.";
          await persist("streaming");
          emit({ type: "tools", plan: { ...plan, turnId, credits: planCost(plan) } });
        } else await persist("complete");

        // Extract [adjustments] block and emit as a separate event
        const adjMatch = fullText.match(/\[adjustments\]([\s\S]*?)\[\/adjustments\]/);
        if (adjMatch && allowAdjustments && !enableTools) {
          try {
            const parsed = normalizeAdjustmentPatch(
              JSON.parse(adjMatch[1]) as Partial<Record<string, number>>,
            );
            emit({ type: "adjustments", adjustments: parsed });
          } catch {
            console.error(
              "[/api/ai/chat] Failed to parse [adjustments] JSON:",
              logSnippetForDiagnostics(adjMatch[1]),
            );
          }
        } else if (adjMatch && !allowAdjustments) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[/api/ai/chat] Ignored [adjustments] block in Ask mode (messageLen=%d)",
              userMessage.length,
            );
          }
        }
      } catch (err) {
        console.error("[/api/ai/chat] Anthropic stream error:", err);
        if (chatCreditCharged) {
          try {
            await refundCreditFeature({
              userId: user.id,
              feature: "chat_message",
              description: "Refund: chat stream failed",
            });
          } catch (refundErr) {
            console.error("[/api/ai/chat] Failed to refund chat credit:", refundErr);
          }
        }
        emit({ type: "interrupted" });
        if (!disconnected) {
          const text = "\n\nSomething went wrong. Please try again.";
          fullText += text;
          emit({ type: "text", text });
        }
        try { await persist("interrupted"); }
        catch (saveError) {
          console.error("[/api/ai/chat] Could not save response:", saveError);
          emit({ type: "history_error" });
        }
      }

      request.signal.removeEventListener("abort", onDisconnect);
      emit({ type: "done" });
      if (!disconnected) {
        try { controller.close(); } catch { /* disconnected after final save */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
