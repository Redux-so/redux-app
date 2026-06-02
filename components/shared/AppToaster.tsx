"use client";

import { Toaster } from "react-hot-toast";
import { defaultToastOptions } from "@/lib/toast-styles";

export default function AppToaster() {
  return <Toaster position="top-center" toastOptions={defaultToastOptions} />;
}
