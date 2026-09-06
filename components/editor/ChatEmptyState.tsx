import Image from "next/image";

import { Icon } from "@/components/shared/Icon";
import { CHAT_SUGGESTIONS } from "@/constants/chat-suggestions";
import { CHAT_PANEL_GUTTER_PX, CHAT_PANEL_WIDTH_PX } from "@/constants/chat-panel";

const SUGGESTION_ICON_SLOT_CLASS = "inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#888888] transition-colors group-hover:text-white [&>svg]:block [&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:shrink-0";
const SUGGESTION_ICON_STROKE = 1.25;

interface ChatEmptyStateProps {
  disabled?: boolean;
  onSelectSuggestion: (message: string) => void;
}

export default function ChatEmptyState({
  disabled = false,
  onSelectSuggestion,
}: ChatEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center w-full">
      <div
        className="flex w-full flex-col items-center"
        style={{ maxWidth: CHAT_PANEL_WIDTH_PX - CHAT_PANEL_GUTTER_PX * 2 }}
      >
        <Image
          src="/r-logo.png"
          alt=""
          width={96}
          height={96}
          className="mb-4 shrink-0 rounded"
          aria-hidden
        />
        <div className="flex w-full flex-col items-center -translate-y-4">
          <p className="mb-7 text-center text-[17px] font-normal text-[#888888]">
            How may I help you?
          </p>
          <div className="flex w-full flex-col gap-2">
          {CHAT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectSuggestion(suggestion.message)}
              className={[
                "group flex h-[46px] min-h-[46px] max-h-[46px] w-full shrink-0 items-center gap-2.5 rounded-lg border border-[#262626] bg-[#1d1d1d] px-4 text-left text-[15px] font-medium leading-none text-[#cccccc] transition-colors",
                disabled
                  ? "cursor-not-allowed opacity-40 pointer-events-none"
                  : "cursor-pointer hover:border-[#282828] hover:text-white",
              ].join(" ")}
            >
              <span className={SUGGESTION_ICON_SLOT_CLASS}>
                <Icon
                  name={suggestion.iconName}
                  size={20}
                  strokeWidth={SUGGESTION_ICON_STROKE}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
            </button>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
