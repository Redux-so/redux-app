import { POST as enhance } from "@/app/api/ai/enhance/route";
import { POST as tone } from "@/app/api/ai/tone/route";
import { POST as color } from "@/app/api/ai/color-balance/route";
import { POST as style } from "@/app/api/ai/style-match/route";
import { POST as background } from "@/app/api/ai/background-remove/route";
import { POST as fill } from "@/app/api/ai/generative-fill/route";
import { POST as blur } from "@/app/api/images/blur/route";
import { POST as erase } from "@/app/api/images/erase/route";
import { POST as heal } from "@/app/api/ai/heal/route";
import { EDITOR_TOOL_ROUTES } from "@/lib/editor-tool-routes";
import { type EditorAction } from "@/lib/editor-actions";
import { fetchPreparedChatImage } from "@/lib/chat-image-context";

const handlers = { auto_enhance: enhance, auto_tone_balance: tone, smart_color_balance: color,
  style_match: style, remove_background: background, generative_fill: fill, blur, eraser: erase, heal };

export async function dispatchChatTool(request: Request, action: EditorAction, input: {
  imageId: string; imageUrl: string; maskBase64?: string; currentAdjustments?: Record<string, number>;
}, referenceUrl: string | null): Promise<Response> {
  const key = action.type === "apply_selection" ? action.tool : action.type;
  if (!(key in handlers)) throw new Error("This action runs in the editor");
  const body: Record<string, unknown> = { ...input };
  if (action.type === "apply_selection") body.blurIntensity = action.intensity ?? 30;
  if (action.type === "generative_fill") Object.assign(body, { expandDirection: action.direction, expandPixels: action.pixels, prompt: action.prompt });
  if (action.type === "style_match") {
    if (!referenceUrl) return Response.json({ error: "Attach a reference image to match its style." }, { status: 400 });
    const reference = await fetchPreparedChatImage(referenceUrl);
    body.referenceImageBase64 = reference.base64;
    body.referenceImageMediaType = reference.mediaType;
  }
  const route = key as keyof typeof handlers;
  // Invoke the actual route, not a user/model-supplied URL. Each handler retains
  // ownership checks, limits, atomic deductions, refunds and provider execution.
  return handlers[route](new Request(new URL(EDITOR_TOOL_ROUTES[route], request.url), {
    method: "POST", headers: request.headers, body: JSON.stringify(body),
  }));
}
