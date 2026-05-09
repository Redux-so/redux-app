import { SignUp } from "@clerk/nextjs";

import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import { reduxAuthAppearance } from "@/lib/redux-clerk-appearance";

export default function Page() {
  return (
    <ReduxClerkAuthShell>
      <SignUp appearance={reduxAuthAppearance} />
    </ReduxClerkAuthShell>
  );
}
