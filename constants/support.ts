/** Redux GitHub organization. */
export const REDUX_DOCS_URL = "https://github.com/Redux-so";

/** Discord community for help and feedback. */
export const REDUX_HELP_FEEDBACK_URL = "https://discord.com/invite/gzHrud9nee";

export const REDUX_TERMS_URL = "https://redux.so/terms";
export const REDUX_PRIVACY_URL = "https://redux.so/privacy";

/** Anchor props for off-site links (marketing, legal, GitHub, etc.). */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

export function openExternalUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
