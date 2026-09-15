import type { ComponentType } from "react";

import OnboardingAdjustmentsPreview from "@/components/onboarding/previews/OnboardingAdjustmentsPreview";
import OnboardingChatPreview from "@/components/onboarding/previews/OnboardingChatPreview";
import OnboardingEditorPreview from "@/components/onboarding/previews/OnboardingEditorPreview";
import OnboardingExportPreview from "@/components/onboarding/previews/OnboardingExportPreview";
import { REDUX_HELP_FEEDBACK_URL } from "@/constants/support";
import OnboardingLibraryPreview from "@/components/onboarding/previews/OnboardingLibraryPreview";

export interface OnboardingStep {
  id: string;
  pillLabel: string;
  stageLabel: string;
  title: string;
  body: string;
  Preview: ComponentType;
  externalLink?: { label: string; href: string };
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "library",
    pillLabel: "Library",
    stageLabel: "YOUR LIBRARY",
    title: "Store and organize every photo in one place",
    body: "Upload from the dropzone or drag files onto the page. Use albums to group shoots, and trash to recover or delete images. Semantic search helps you find photos by what's in them, not just filenames.",
    Preview: OnboardingLibraryPreview,
  },
  {
    id: "editor",
    pillLabel: "Editor",
    stageLabel: "THE EDITOR",
    title: "Open any photo to edit on the canvas",
    body: "Click a photo in your library to open the editor. Your work saves as you go. Adjustments, crops, and AI results stay tied to that image until you export.",
    Preview: OnboardingEditorPreview,
  },
  {
    id: "ai",
    pillLabel: "AI",
    stageLabel: "ADJUST & ENHANCE",
    title: "Fine-tune manually or use AI tools",
    body: "Use the tool rail for light, color, effects, retouch, and crop. AI actions like auto enhance and background removal use credits, and you'll see the cost before you run them.",
    Preview: OnboardingAdjustmentsPreview,
  },
  {
    id: "chat",
    pillLabel: "Chat",
    stageLabel: "CHAT",
    title: "Describe edits in plain language",
    body: "Ask the assistant to change lighting, remove distractions, or suggest next steps. Chat uses credits when AI limits apply.",
    Preview: OnboardingChatPreview,
  },
  {
    id: "credits",
    pillLabel: "Credits",
    stageLabel: "EXPORT & ACCOUNT",
    title: "Export when you're done, and manage credits in Settings",
    body: "Download JPEG, PNG, or TIFF from Export. In Settings, update your profile, buy credits, and manage billing. To replay this tour later, open Settings, go to About, and click Help.",
    Preview: OnboardingExportPreview,
    externalLink: {
      label: "Join Discord for help",
      href: REDUX_HELP_FEEDBACK_URL,
    },
  },
];
