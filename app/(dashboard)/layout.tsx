import AppToaster from "@/components/shared/AppToaster";
import ViewportHeight from "@/components/shared/ViewportHeight";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ViewportHeight />
      {children}
      <AppToaster />
    </>
  );
}
