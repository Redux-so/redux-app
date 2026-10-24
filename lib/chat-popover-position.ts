/** Keep body-portaled chat menus inside the visible screen, including the keyboard. */
export function positionChatPopover(
  trigger: Pick<DOMRect, "top" | "bottom" | "left" | "width">,
  menuWidth: number,
  menuHeight: number,
) {
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
  const topEdge = (viewport?.offsetTop ?? 0) + 8;
  const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
  const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
  const width = Math.min(menuWidth, Math.max(1, rightEdge - leftEdge));
  const maxHeight = Math.max(1, bottomEdge - topEdge);
  const height = Math.min(menuHeight, maxHeight);
  const above = trigger.top - topEdge;
  const below = bottomEdge - trigger.bottom;
  const placement: "above" | "below" = below >= height && below > above ? "below" : "above";
  const top = placement === "below" ? trigger.bottom + 6 : trigger.top - height - 6;
  return {
    placement, width, maxHeight,
    top: Math.max(topEdge, Math.min(top, bottomEdge - height)),
    left: Math.max(leftEdge, Math.min(trigger.left, rightEdge - width)),
  };
}
