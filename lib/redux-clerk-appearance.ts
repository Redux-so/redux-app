import { dark } from "@clerk/themes";

/** Shared Clerk variables — aligned with Redux dark UI and lib/button-styles CTAs. */
export const reduxClerkVariables = {
  colorPrimary: "#8758ed",
  colorPrimaryForeground: "#ffffff",
  colorBackground: "#111111",
  colorForeground: "#ffffff",
  colorMutedForeground: "#888888",
  colorMuted: "#1a1a1a",
  colorInput: "#1a1a1a",
  colorInputForeground: "#ffffff",
  colorNeutral: "#888888",
  colorText: "#ededed",
  colorTextSecondary: "#888888",
  colorBorder: "rgba(255, 255, 255, 0.1)",
  borderRadius: "6px",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

const reduxModalButtonPrimary =
  "!box-border !flex !h-10 !w-full !min-w-0 !items-center !justify-center !rounded-md !border !border-white/15 !bg-white !px-5 !text-[13px] !font-medium !leading-none !text-[#0a0a0a] !shadow-none transition-colors duration-200 hover:!bg-[#e5e5e5] active:!bg-[#d4d4d4]";

const reduxFormElements = {
  formFieldLabel: "!text-[13px] !font-medium !text-[#888888]",
  formFieldInput:
    "!h-11 !rounded-lg !border !border-solid !border-white/10 !bg-[#1a1a1a] !text-[14px] !text-white placeholder:!text-[#555555] focus:!border-white/20",
  formFieldInputShowPasswordButton: "!text-[#888888] hover:!text-white",
  formButtonPrimary:
    "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !rounded-md !border !border-white/20 !bg-[#8758ed] !px-5 !text-[13px] !font-medium !leading-none !text-white !shadow-btn-primary transition-[background-color,box-shadow] duration-200 hover:!bg-[#9a6ff2] hover:!shadow-btn-primary-hover active:!shadow-btn-primary-active",
  formFieldAction: "!text-[#8758ed] hover:!text-[#9a6ff2]",
  formFieldErrorText: "!text-red-400",
  formResendCodeLink: "!text-[#8758ed] hover:!text-[#9a6ff2]",
  otpCodeFieldInput:
    "!rounded-lg !border-white/10 !bg-[#1a1a1a] !text-white",
} as const;

/** UserProfile modal (Edit Profile / Security) — rendered in a body portal by openUserProfile(). */
const reduxUserProfileElements = {
  modalBackdrop: "!bg-black/70",
  modalContent:
    "!rounded-xl !border !border-white/10 !bg-[#111111] !shadow-2xl",
  rootBox: "!bg-[#111111]",
  cardBox: "!shadow-none",
  card: "!rounded-xl !border !border-white/10 !bg-[#111111] !shadow-none",
  navbar: "!border-r !border-white/10 !bg-[#111111]",
  navbarButtons: "!bg-[#111111]",
  navbarButton:
    "!text-[#888888] hover:!bg-white/[0.07] hover:!text-white data-[active=true]:!bg-white/[0.06] data-[active=true]:!text-white",
  navbarButtonIcon: "!text-[#888888]",
  pageScrollBox: "!bg-[#111111]",
  page: "!bg-[#111111]",
  scrollBox: "!bg-[#111111]",
  headerTitle: "!text-[16px] !font-medium !text-white",
  headerSubtitle: "!text-[#888888]",
  profileSectionTitle: "!text-[12px] !font-semibold !text-[#888888]",
  profileSectionTitleText: "!text-[#888888]",
  profileSectionContent: "!text-white",
  profileSectionPrimaryButton: "!text-white hover:!text-[#cccccc]",
  badge: "!border !border-white/10 !bg-white/[0.06] !text-[#888888]",
  accordionTriggerButton: "!text-white hover:!bg-white/[0.05]",
  menuButton: "!text-[#888888] hover:!bg-white/[0.07] hover:!text-white",
  menuList: "!rounded-md !border !border-white/10 !bg-[#111111]",
  menuItem: "!text-[#cccccc] hover:!bg-white/[0.07]",
  alertText: "!text-[#888888]",
  footer: "!bg-transparent",
  identityPreviewText: "!text-[#888888]",
  formFieldLabel: reduxFormElements.formFieldLabel,
  formFieldInput: reduxFormElements.formFieldInput,
  formFieldInputShowPasswordButton: reduxFormElements.formFieldInputShowPasswordButton,
  formButtonPrimary: reduxModalButtonPrimary,
  formFieldAction: "!text-white hover:!text-[#cccccc]",
  formFieldErrorText: reduxFormElements.formFieldErrorText,
  formResendCodeLink: "!text-white hover:!text-[#cccccc]",
  otpCodeFieldInput: reduxFormElements.otpCodeFieldInput,
} as const;

/**
 * Global Clerk appearance — applies to portaled modals (UserProfile) and all Clerk UI.
 * Redux is dark-only today; wire to next-themes here if a light mode is added.
 */
export const reduxClerkProviderAppearance = {
  baseTheme: dark,
  variables: {
    ...reduxClerkVariables,
    colorPrimary: "#ffffff",
    colorPrimaryForeground: "#0a0a0a",
  },
  elements: reduxUserProfileElements,
};

/** Passed to openUserProfile() so modal overlays inherit Redux styling even when opened programmatically. */
export const reduxUserProfileAppearance = reduxClerkProviderAppearance;

/** Clerk theme aligned with Redux CTAs (lib/button-styles) and toasts (lib/toast-styles). */
export const reduxAuthAppearance = {
  baseTheme: dark,
  variables: reduxClerkVariables,
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
    identityPreviewText: "!text-[#888888]",
    footer: "!w-full !overflow-visible !bg-transparent !pt-1",
    footerAction: "!w-full !overflow-visible",
    footerActionText: "!text-[14px] !text-[#888888]",
    footerActionLink:
      "!text-[14px] !font-medium !text-[#8758ed] hover:!text-[#9a6ff2]",
    footerPages: "!text-[#888888]",
    footerPagesLink: "!text-[#8758ed] hover:!text-[#9a6ff2]",
    alternativeMethodsBlockButton:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !rounded-md !border !border-white/15 !bg-transparent !px-5 !text-white hover:!bg-white/[0.05]",
    socialButtons: "!flex !w-full !max-w-none !flex-col !gap-3 !overflow-visible",
    socialButtonsBlockButton:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !gap-2.5 !rounded-md !border !border-solid !border-white/15 !bg-transparent !px-5 !text-white !shadow-none hover:!bg-white/[0.05]",
    socialButtonsBlockButtonText:
      "!text-[13px] !font-medium !leading-none !text-white",
    socialButtonsProviderIcon: "!h-5 !w-5 shrink-0",
    socialButtonsIconButton: "!hidden",
    dividerRow: "!my-2 !w-full",
    dividerLine: "!bg-white/[0.08]",
    dividerText: "!text-[12px] !font-medium !text-[#555555]",
    logoBox: "!hidden",
    logoImage: "!hidden",
    internal: "!hidden",
    ...reduxFormElements,
  },
};

/** Sign-in card — Xynth-style field order: email/password/login, then Or, then Google. */
export const reduxSignInAppearance = {
  ...reduxAuthAppearance,
  layout: {
    ...reduxAuthAppearance.layout,
    socialButtonsPlacement: "bottom" as const,
  },
  elements: {
    ...reduxAuthAppearance.elements,
    main: "!w-full !gap-4 !overflow-visible",
    formFieldLabel: "!text-[13px] !font-medium !text-white",
    formFieldRow__password:
      "!flex !w-full !flex-row !items-center !justify-between !gap-3",
    formFieldAction:
      "!text-[13px] !font-medium !text-white !underline !underline-offset-2 hover:!text-white/80",
    footerAction: "!hidden",
    dividerText:
      "!text-[13px] !font-normal !normal-case !tracking-normal !text-[#555555]",
    socialButtonsBlockButton:
      "!box-border !flex !h-12 !w-full !min-w-0 !items-center !justify-center !gap-2.5 !rounded-md !border !border-solid !border-white/10 !bg-[#1a1a1a] !px-5 !text-white !shadow-none hover:!bg-white/[0.05]",
    formButtonPrimary:
      "!box-border !flex !h-11 !w-full !min-w-0 !items-center !justify-center !rounded-md !border !border-white/20 !bg-[#8758ed] !px-5 !text-[13px] !font-medium !leading-none !text-white !shadow-btn-primary transition-[background-color,box-shadow] duration-200 hover:!bg-[#9a6ff2] hover:!shadow-btn-primary-hover active:!shadow-btn-primary-active",
  },
};

export const reduxSignInLocalization = {
  formButtonPrimary: "Login",
  formFieldLabel__emailAddress: "Email",
  formFieldLabel__password: "Password",
  formFieldInputPlaceholder__emailAddress: "m@example.com",
  formFieldInputPlaceholder__password: "Password",
  dividerText: "Or",
};
