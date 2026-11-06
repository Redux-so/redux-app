import { redirect } from "next/navigation";
import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignUpForm from "@/components/auth/SignUpForm";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { __clerk_ticket: ticket, __clerk_status: status } = await searchParams;
  const invitationTicket = typeof ticket === "string" && ticket ? ticket : undefined;
  if (invitationTicket && status === "sign_in") redirect("/sign-in");

  return (
    <ReduxClerkAuthShell
      title={invitationTicket ? "Finish setting up your account" : "Create your account"}
      signInLink
      legalFooter
      panelSize="large"
    >
      <SignUpForm invitationTicket={invitationTicket} />
    </ReduxClerkAuthShell>
  );
}
