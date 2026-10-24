import { SURFACE_MAIN_HEX } from "@/lib/surface-colors";

/** Open synchronously from the button click so browsers retain user activation. */
export async function authenticateWithGooglePopup(
  authenticate: (popup: Window) => Promise<void>,
): Promise<void> {
  const popup = window.open("", "_blank", "popup,width=500,height=700");
  if (!popup) {
    throw new Error("Allow pop-ups for Redux, then try Continue with Google again.");
  }

  try {
    // The initial empty document is ours; Google's pages retain their own styling.
    popup.document.title = "Sign in to Redux";
    popup.document.documentElement.style.backgroundColor = SURFACE_MAIN_HEX;
    popup.document.documentElement.style.colorScheme = "dark";
    await authenticate(popup);
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}
