import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignUpForm from "@/components/auth/SignUpForm";

export default function Page() {
  return (
    <ReduxClerkAuthShell
      title="Create your account"
      signInLink
      legalFooter
      panelSize="large"
    >
      <SignUpForm />
    </ReduxClerkAuthShell>
  );
}
