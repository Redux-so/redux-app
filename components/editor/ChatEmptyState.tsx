import Image from "next/image";

import { Icon } from "@/components/shared/Icon";
import { CHAT_SUGGESTIONS } from "@/constants/chat-suggestions";

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
      <div className="flex w-full max-w-[360px] flex-col items-center">
        <Image
          src="/r-logo.png"
          alt=""
          width={96}
          height={96}
          className="mb-4 shrink-0 rounded"
          aria-hidden
        />
        <div className="flex w-full flex-col items-center -translate-y-4">
          <p className="mb-7 text-center text-[18px] font-normal text-[#888888]">
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
                "group flex h-11 w-full items-center gap-2.5 rounded-lg border border-[#2e2e2e] bg-[#1d1d1d] px-4 text-left text-[14px] font-medium text-[#cccccc] transition-colors",
                disabled
                  ? "cursor-not-allowed opacity-40 pointer-events-none"
                  : "cursor-pointer hover:border-[#3a3a3a] hover:text-white",
              ].join(" ")}
            >
              <Icon
                name={suggestion.iconName}
                size={24}
                className="shrink-0 text-[#888888] transition-colors group-hover:text-white"
                aria-hidden
              />
              <span className="min-w-0 truncate">{suggestion.label}</span>
            </button>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
