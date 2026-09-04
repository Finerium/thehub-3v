// The signed-in shell (ARCHITECTURE 1.1, D-07): every surface below this segment needs a session. The proxy has
// already turned a request without a cookie away; requireSession() catches the cookie whose row is gone or
// expired and sends it to /login?next=<path>. The rail's role badge carries the session's alias and role, the
// title block the running commit when the platform provides one.
import type { ReactNode } from "react";
import { requireSession } from "@/auth/session";
import { AppShell } from "@/components/AppShell";

export default async function HubLayout({ children }: { children: ReactNode }) {
  const { alias, role } = await requireSession();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  return (
    <AppShell commit={commit} session={{ alias, role }}>
      {children}
    </AppShell>
  );
}
