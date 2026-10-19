import { NextResponse } from "next/server";
import type { ImageBlockParam, MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic, formatAdjustmentsForPrompt } from "@/lib/anthropic";
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
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
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
    adjustments,
    conversationHistory,
    imageId,
    workspaceImageUrl,
    imageBase64,
    imageMediaType,
    chatInteractionMode,
  } = parsed.data;

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

  if (imageBase64 && imageMediaType) {
    try {
      const prepared = await prepareChatVisionBase64(imageBase64);
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
    text: `${userMessage.trim()}\n\n${adjustmentsContext}`,
  });

  const anthropicMessages = buildAnthropicMessages(conversationHistory, userContent);
  const allowAdjustments = allowChatAdjustmentsForTurn(chatInteractionMode);

  // ── Consume free message or credit ───────────────────────────────────────
  let lifetimeFreeRemaining: number;
  let lifetimeFreeUsed: number;
  let creditBalanceAfter: number;
  let chatCreditCharged = false;

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
      return insufficientCreditsResponse();
    }
    const charge = await chargeCreditFeature({
      userId: user.id,
      feature: "chat_message",
    });
    if (!charge.ok) {
      return insufficientCreditsResponse();
    }
    chatCreditCharged = true;
    lifetimeFreeRemaining = 0;
    lifetimeFreeUsed = user.lifetimeFreeAI;
    creditBalanceAfter = charge.balanceAfter;
  }

  // ── Stream response ───────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeEvent({
          type: "meta",
          lifetimeFreeRemaining,
          lifetimeFreeUsed,
          creditBalanceAfter,
        }),
      );

      let fullText = "";

      try {
        const claudeStream = anthropic.messages.stream({
          model: ANTHROPIC_DEFAULT_MODEL,
          max_tokens: 1024,
          system: buildChatSystemPrompt(chatInteractionMode),
          messages: anthropicMessages,
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            controller.enqueue(encodeEvent({ type: "text", text: chunk }));
          }
        }

        // Extract [adjustments] block and emit as a separate event
        const adjMatch = fullText.match(/\[adjustments\]([\s\S]*?)\[\/adjustments\]/);
        if (adjMatch && allowAdjustments) {
          try {
            const parsed = normalizeAdjustmentPatch(
              JSON.parse(adjMatch[1]) as Partial<Record<string, number>>,
            );
            controller.enqueue(encodeEvent({ type: "adjustments", adjustments: parsed }));
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

        if (chatInteractionMode === "ask" && askModeNudgeMissing(fullText)) {
          const suffix = `\n\n${ASK_SWITCH_TO_AGENT_NUDGE}`;
          fullText += suffix;
          controller.enqueue(encodeEvent({ type: "text", text: suffix }));
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
        controller.enqueue(
          encodeEvent({ type: "text", text: "\n\nSomething went wrong. Please try again." }),
        );
      }

      controller.enqueue(encodeEvent({ type: "done" }));
      controller.close();
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
