import AppToaster from "@/components/shared/AppToaster";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
