import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic, formatAdjustmentsForPrompt } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import type { AdjustmentKey } from "@/constants/adjustments";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { USAGE_RING_CONFIG } from "@/constants/usage-ring";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-system-prompt";
import {
  fetchChatImageBase64,
  isChatImageMediaType,
  type ChatImageMediaType,
} from "@/lib/chat-image-context";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";

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
interface ChatRequestBody {
  userMessage: string;
  adjustments?: Record<AdjustmentKey, number>;
  imageId?: string;
  workspaceImageUrl?: string;
  imageBase64?: string;
  imageMediaType?: string;
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
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const {
    userMessage,
    adjustments = {},
    imageId,
    workspaceImageUrl,
    imageBase64,
    imageMediaType,
  } = body;

  if (!userMessage?.trim()) {
    return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
  }

  // ── Find user ─────────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

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
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const hourly = await checkRateLimit(user.id, "chat_free", FREE_HOURLY_LIMIT);
    if (!hourly.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }
  } else {
    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "chat_credit",
      RATE_LIMIT_MINUTE.chat_credit,
    );
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const hourly = await checkRateLimit(user.id, "chat_credit", CREDIT_HOURLY_LIMIT);
    if (!hourly.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }
  }

  // ── Consume free message or credit ───────────────────────────────────────
  let lifetimeFreeRemaining: number;
  let lifetimeFreeUsed: number;
  let creditBalanceAfter: number;

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
    if (user.creditBalance < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: 1 } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -1,
        feature: "chat_message",
      },
    });
    lifetimeFreeRemaining = 0;
    lifetimeFreeUsed = user.lifetimeFreeAI;
    creditBalanceAfter = user.creditBalance - 1;
  }

  // ── Build Anthropic message content ───────────────────────────────────────
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
        pushImageBlock(userContent, workspaceImage.base64, workspaceImage.mediaType);
      }
    } catch (err) {
      console.error("[/api/ai/chat] Failed to load workspace image:", err);
    }
  }

  if (imageBase64 && imageMediaType) {
    pushImageBlock(userContent, imageBase64, imageMediaType);
  }

  userContent.push({
    type: "text",
    text: `${userMessage.trim()}\n\n${adjustmentsContext}`,
  });

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
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: CHAT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
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
        if (adjMatch) {
          try {
            const parsed = normalizeAdjustmentPatch(
              JSON.parse(adjMatch[1]) as Partial<Record<string, number>>,
            );
            controller.enqueue(encodeEvent({ type: "adjustments", adjustments: parsed }));
          } catch {
            console.error("[/api/ai/chat] Failed to parse [adjustments] JSON:", adjMatch[1]);
          }
        }
      } catch (err) {
        console.error("[/api/ai/chat] Anthropic stream error:", err);
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
