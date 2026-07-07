/** Clerk theme aligned with Redux CTAs (lib/button-styles) and toasts (lib/toast-styles). */
export const reduxAuthAppearance = {
  variables: {
    colorPrimary: "#8758ed",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "#111111",
    colorForeground: "#ffffff",
    colorMutedForeground: "#888888",
    colorMuted: "#1a1a1a",
    colorInput: "#1a1a1a",
    colorInputForeground: "#ffffff",
    colorBorder: "rgba(255, 255, 255, 0.1)",
    borderRadius: "9999px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  layout: {
    socialButtonsVariant: "blockButton" as const,
    socialButtonsPlacement: "top" as const,
  },
  elements: {
    rootBox: "mx-auto w-full max-w-none overflow-visible shadow-none",
    cardBox: "!w-full !max-w-none !overflow-visible !shadow-none",
    card: "!w-full !max-w-none !overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none !p-0",
    header: "!hidden",
    headerTitle: "!hidden",
    headerSubtitle: "!hidden",
    main: "!w-full !gap-5 !overflow-visible",
    form: "!w-full !gap-4 !overflow-visible",
    formFieldRow: "!w-full !overflow-visible",
    formButtonRow: "!w-full !overflow-visible",
    formButtonPrimary:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !rounded-full !border !border-white/20 !bg-[#8758ed] !px-5 !text-[13px] !font-medium !leading-none !text-white !shadow-btn-primary transition-[background-color,box-shadow] duration-200 hover:!bg-[#9a6ff2] hover:!shadow-btn-primary-hover active:!shadow-btn-primary-active",
    formFieldLabel: "!text-[13px] !font-medium !text-[#888888]",
    formFieldInput:
      "!h-11 !rounded-xl !border !border-solid !border-white/10 !bg-[#1a1a1a] !text-[14px] !text-white placeholder:!text-[#555555] focus:!border-white/20",
    formFieldInputShowPasswordButton: "!text-[#888888] hover:!text-white",
    identityPreviewText: "!text-[#888888]",
    formResendCodeLink: "!text-[#8758ed] hover:!text-[#9a6ff2]",
    footer: "!w-full !overflow-visible !bg-transparent !pt-1",
    footerAction: "!w-full !overflow-visible",
    footerActionText: "!text-[14px] !text-[#888888]",
    footerActionLink:
      "!text-[14px] !font-medium !text-[#8758ed] hover:!text-[#9a6ff2]",
    footerPages: "!text-[#888888]",
    footerPagesLink: "!text-[#8758ed] hover:!text-[#9a6ff2]",
    alternativeMethodsBlockButton:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !rounded-full !border !border-white/15 !bg-transparent !px-5 !text-white hover:!bg-white/[0.05]",
    socialButtons: "!flex !w-full !max-w-none !flex-col !gap-3 !overflow-visible",
    socialButtonsBlockButton:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !gap-2.5 !rounded-full !border !border-solid !border-white/20 !bg-white !px-5 !text-[#111111] !shadow-none hover:!bg-white/90",
    socialButtonsBlockButtonText:
      "!text-[13px] !font-medium !leading-none !text-[#111111]",
    socialButtonsProviderIcon: "!h-5 !w-5 shrink-0",
    socialButtonsIconButton: "!hidden",
    dividerRow: "!my-2 !w-full",
    dividerLine: "!bg-white/[0.08]",
    dividerText:
      "!text-[11px] !font-medium !uppercase !tracking-[0.14em] !text-[#555555]",
    otpCodeFieldInput:
      "!rounded-xl !border-white/10 !bg-[#1a1a1a] !text-white",
    formFieldErrorText: "!text-red-400",
    logoBox: "!hidden",
    logoImage: "!hidden",
    internal: "!hidden",
  },
};
