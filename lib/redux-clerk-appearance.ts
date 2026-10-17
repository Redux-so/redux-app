import { dark } from "@clerk/themes";

import { PRIMARY_BRAND_HEX } from "@/lib/brand-colors";
import { GEIST_SANS_FONT_FAMILY } from "@/lib/fonts";
import {
  SURFACE_BORDER_HEX,
  SURFACE_PANEL_HEX,
  SURFACE_RAISED_HEX,
} from "@/lib/surface-colors";

/** Static Tailwind classes — dynamic `!text-[${hex}]` breaks Clerk + Tailwind JIT. */
const clerkBrandLink = "!text-[#7CA8FF] hover:!text-[#96BBFF]";

/** Shared Clerk variables — aligned with Redux dark UI and lib/button-styles CTAs. */
export const reduxClerkVariables = {
  colorPrimary: PRIMARY_BRAND_HEX,
  colorPrimaryForeground: "#ffffff",
  colorBackground: SURFACE_PANEL_HEX,
  colorForeground: "#ffffff",
  colorMutedForeground: "#888888",
  colorMuted: SURFACE_RAISED_HEX,
  colorInput: SURFACE_RAISED_HEX,
  colorInputForeground: "#ffffff",
  colorNeutral: "#888888",
  colorText: "#ededed",
  colorTextSecondary: "#888888",
  colorBorder: SURFACE_BORDER_HEX,
  borderRadius: "6px",
  fontFamily: GEIST_SANS_FONT_FAMILY,
} as const;

const reduxModalButtonPrimary =
  "!box-border !flex !h-10 !w-full !min-w-0 !items-center !justify-center !rounded-md !border !border-[#ffffff]/10 !bg-[#ededed] !px-5 !text-[13px] !font-medium !leading-none !text-[#2a2a2a] !shadow-none transition-colors duration-200 hover:!bg-[#e0e0e0] active:!bg-[#d4d4d4] [&_svg]:!text-[#2a2a2a] [&_svg]:!stroke-current";

const reduxFormElements = {
  formFieldLabel: "!text-[13px] !font-medium !text-[#888888]",
  formFieldInput:
    "!h-11 !rounded-lg !border !border-solid !border-[#262626] !bg-[#1d1d1d] !text-[14px] !text-white placeholder:!text-[#555555] focus:!border-[#2e2e2e]",
  formFieldInputShowPasswordButton: "!text-[#888888] hover:!text-white",
  formFieldAction: clerkBrandLink,
  formFieldErrorText: "!text-red-400",
  formResendCodeLink: clerkBrandLink,
  otpCodeFieldInput:
    "!rounded-lg !border-[#262626] !bg-[#1d1d1d] !text-white",
} as const;

/** UserProfile modal (Edit Profile / Security) — rendered in a body portal by openUserProfile(). */
const reduxUserProfileElements = {
  modalBackdrop: "!bg-black/70",
  modalContent:
    "!rounded-xl !border !border-[#212121] !bg-[#121212] !shadow-2xl",
  rootBox: "!bg-[#121212]",
  cardBox: "!shadow-none",
  card: "!rounded-xl !border !border-[#212121] !bg-[#121212] !shadow-none",
  navbar: "!border-r !border-[#212121] !bg-[#121212]",
  navbarButtons: "!bg-[#121212]",
  navbarButton:
    "!text-[#888888] hover:!bg-[#1d1d1d] hover:!text-white data-[active=true]:!bg-[#1d1d1d] data-[active=true]:!border-[#262626] data-[active=true]:!text-white",
  navbarButtonIcon: "!text-[#888888]",
  pageScrollBox: "!bg-[#121212]",
  page: "!bg-[#121212]",
  scrollBox: "!bg-[#121212]",
  headerTitle: "!text-[16px] !font-medium !text-white",
  headerSubtitle: "!text-[#888888]",
  profileSectionTitle: "!text-[12px] !font-semibold !text-[#888888]",
  profileSectionTitleText: "!text-[#888888]",
  profileSectionContent: "!text-white",
  profileSectionPrimaryButton: "!text-white hover:!text-[#cccccc]",
  avatarBox: "!rounded-full",
  userAvatarBox: "!rounded-full",
  userPreviewAvatarBox: "!rounded-full",
  userPreviewAvatarImage: "!rounded-full",
  badge: "!border !border-[#262626] !bg-[#1d1d1d] !text-[#888888]",
  accordionTriggerButton: "!text-white hover:!bg-[#1d1d1d]",
  menuButton: "!text-[#888888] hover:!bg-[#1d1d1d] hover:!text-white",
  menuList: "!rounded-md !border !border-[#212121] !bg-[#121212]",
  menuItem: "!text-[#cccccc] hover:!bg-[#1d1d1d]",
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
    colorPrimaryForeground: "#2a2a2a",
  },
  elements: reduxUserProfileElements,
};

/** Passed to openUserProfile() so modal overlays inherit Redux styling even when opened programmatically. */
export const reduxUserProfileAppearance = reduxClerkProviderAppearance;
