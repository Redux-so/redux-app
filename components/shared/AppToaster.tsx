"use client";

import { resolveValue, ToastBar, Toaster } from "react-hot-toast";
import { defaultToastOptions, toastAnimation } from "@/lib/toast-styles";

export default function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      containerClassName="redux-toaster"
      containerStyle={{
        top: "calc(16px + env(safe-area-inset-top, 0px))",
        right: "calc(16px + env(safe-area-inset-right, 0px))",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        left: "calc(16px + env(safe-area-inset-left, 0px))",
      }}
      toastOptions={defaultToastOptions}
    >
      {(notification) => {
        const message = resolveValue(notification.message, notification);

        return (
          <ToastBar
            toast={{
              ...notification,
              message: typeof message === "string"
                ? message.replace(/[.!?…:;]+(?=\s|$)/gu, "").trim()
                : message,
            }}
            position="bottom-right"
            style={{ animation: toastAnimation(notification.visible) }}
          />
        );
      }}
    </Toaster>
  );
}
