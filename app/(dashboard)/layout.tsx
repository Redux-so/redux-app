import OnboardingHost from "@/components/onboarding/OnboardingHost";
import AppToaster from "@/components/shared/AppToaster";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingHost>
      {children}
      <AppToaster />
    </OnboardingHost>
  );
}
