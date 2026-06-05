import { SignUp } from "@clerk/nextjs";

import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import { reduxAuthAppearance } from "@/lib/redux-clerk-appearance";

const AFTER_AUTH = "/library";

export default function Page() {
  return (
    <ReduxClerkAuthShell
      title="Create your account"
      subtitle="Enter your details to get started with Redux"
    >
      <SignUp
        appearance={reduxAuthAppearance}
        forceRedirectUrl={AFTER_AUTH}
        fallbackRedirectUrl={AFTER_AUTH}
        signInForceRedirectUrl={AFTER_AUTH}
        signInFallbackRedirectUrl={AFTER_AUTH}
      />
    </ReduxClerkAuthShell>
  );
}
