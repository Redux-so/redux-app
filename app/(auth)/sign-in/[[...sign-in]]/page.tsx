import { SignIn } from "@clerk/nextjs";

import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import { reduxAuthAppearance } from "@/lib/redux-clerk-appearance";

export default function Page() {
  return (
    <ReduxClerkAuthShell>
      <SignIn appearance={reduxAuthAppearance} />
    </ReduxClerkAuthShell>
  );
}
