import { redirect } from "next/navigation";
import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignInForm from "@/components/auth/SignInForm";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { __clerk_ticket: ticket, __clerk_status: status } = await searchParams;
  const hasTicket = typeof ticket === "string" && Boolean(ticket);
  if (hasTicket && status === "sign_in") redirect("/sign-in");

  const invitationSignUpHref = typeof ticket === "string" && ticket
    ? `/sign-up?${new URLSearchParams({ __clerk_ticket: ticket })}`
    : undefined;

  return (
    <ReduxClerkAuthShell title="Log in to Redux" signUpLink invitationSignUpHref={invitationSignUpHref} legalFooter panelSize="large">
      <SignInForm />
    </ReduxClerkAuthShell>
  );
}
