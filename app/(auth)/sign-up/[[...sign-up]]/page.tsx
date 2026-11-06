import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { appPath } from "@/lib/app-path";
import ReduxClerkAuthShell from "@/components/auth/ReduxClerkAuthShell";
import SignUpForm from "@/components/auth/SignUpForm";

export default async function Page({ params, searchParams }: PageProps<"/sign-up/[[...sign-up]]">) {
  const [route, query] = await Promise.all([params, searchParams]);
  const hasTicket = typeof query.__clerk_ticket === "string" && Boolean(query.__clerk_ticket);
  if (hasTicket && query.__clerk_status === "sign_in") redirect("/sign-in");

  // Clerk can navigate to a nested completion step after consuming the ticket.
  if (hasTicket || route["sign-up"]?.length) {

    return (
      <ReduxClerkAuthShell title="Finish setting up your account" legalFooter panelSize="large">
        <SignUp
          routing="path"
          path={appPath("/sign-up")}
          signInUrl={appPath("/sign-in")}
          forceRedirectUrl={appPath("/library")}
          appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }}
        />
      </ReduxClerkAuthShell>
    );
  }

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
