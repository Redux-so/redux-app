"use client";

import { createContext, useContext, type ReactNode } from "react";

const CreditPurchasesContext = createContext(false);

export function CreditPurchasesProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <CreditPurchasesContext value={value}>{children}</CreditPurchasesContext>;
}

export function useCreditPurchasesEnabled(): boolean {
  return useContext(CreditPurchasesContext);
}
