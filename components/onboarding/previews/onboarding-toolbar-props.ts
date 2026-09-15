import type { ComponentProps } from "react";

import type Toolbar from "@/components/editor/Toolbar";

/** Static toolbar state for product-tour editor previews. */
export const ONBOARDING_TOOLBAR_PROPS: ComponentProps<typeof Toolbar> = {
  filename: "photo.jpg",
  zoom: 1,
  showBefore: false,
  canUndo: false,
  canRedo: false,
  isDirty: false,
  justSaved: false,
  zoomIn: () => {},
  zoomOut: () => {},
  resetZoom: () => {},
  toggleBefore: () => {},
  onUndo: () => {},
  onRedo: () => {},
  onExport: () => {},
};
