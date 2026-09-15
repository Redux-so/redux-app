import type { ReactNode } from "react";

/** Same wrapper as `EditorApp` around the live Fabric canvas. */
export default function OnboardingEditorCanvasRegion({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
