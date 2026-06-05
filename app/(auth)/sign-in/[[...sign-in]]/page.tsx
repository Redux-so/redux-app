import { SignIn } from "@clerk/nextjs";

import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import { reduxAuthAppearance } from "@/lib/redux-clerk-appearance";

const AFTER_AUTH = "/library";

export default function Page() {
  return (
    <ReduxClerkAuthShell
      title="Welcome back"
      subtitle="Enter your credentials to access your account"
    >
      <SignIn
        appearance={reduxAuthAppearance}
        forceRedirectUrl={AFTER_AUTH}
        fallbackRedirectUrl={AFTER_AUTH}
        signUpForceRedirectUrl={AFTER_AUTH}
        signUpFallbackRedirectUrl={AFTER_AUTH}
      />
    </ReduxClerkAuthShell>
  );
}
