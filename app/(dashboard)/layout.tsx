import AppToaster from "@/components/shared/AppToaster";
import ViewportHeight from "@/components/shared/ViewportHeight";
import { CreditPurchasesProvider } from "@/lib/credit-purchases-context";
import { creditPurchasesEnabled } from "@/lib/credit-purchases";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CreditPurchasesProvider value={creditPurchasesEnabled()}>
      <ViewportHeight />
      {children}
      <AppToaster />
    </CreditPurchasesProvider>
  );
}
