import type { IconName } from "@/components/shared/Icon";

export interface ChatSuggestion {
  id: string;
  label: string;
  message: string;
  iconName: IconName;
}

export const CHAT_SUGGESTIONS: ChatSuggestion[] = [
  {
    id: "edit-recommendations",
    label: "Get edit recommendations",
    message: "What edits would you recommend for this image?",
    iconName: "Star04",
  },
  {
    id: "exposure-color",
    label: "Check exposure & color",
    message: "Does the exposure or color balance look off?",
    iconName: "Sun",
  },
  {
    id: "style-mood",
    label: "Explore style & mood",
    message: "What mood or style would suit this photo?",
    iconName: "Colors",
  },
];
