import { redirect } from "next/navigation";
import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignInForm from "@/components/auth/SignInForm";

export default async function Page({ searchParams }: PageProps<"/sign-in/[[...sign-in]]">) {
  const { __clerk_ticket: ticket, __clerk_status: status } = await searchParams;
  if (typeof ticket === "string" && ticket) {
    // Clerk routes already-accepted invitations to sign-in. Start normal auth
    // without replaying the consumed ticket.
    if (status === "sign_in") redirect("/sign-in");
    redirect(`/sign-up?${new URLSearchParams({ __clerk_ticket: ticket })}`);
  }

  return (
    <ReduxClerkAuthShell title="Log in to Redux" signUpLink legalFooter panelSize="large">
      <SignInForm />
    </ReduxClerkAuthShell>
  );
}
