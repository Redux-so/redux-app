import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignInForm from "@/components/auth/SignInForm";

export default function Page() {
  return (
    <ReduxClerkAuthShell title="Log in to Redux" signUpLink legalFooter panelSize="large">
      <SignInForm />
    </ReduxClerkAuthShell>
  );
}
