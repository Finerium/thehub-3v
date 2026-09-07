// Signing a browser in as a role other than the one the global setup stored (D-07, D-16). The config's stored state
// is the demo Engineer; a test that needs the Reviewing Supervisor, the Manager or the Admin posts the login route
// itself with that account's password read from the environment. The password is handed straight to the request
// body: it is never logged, never put on a command line and never written anywhere but the cookie jar the platform
// returns, and a failed login is reported by its status alone, so no body of a credential exchange is printed.
//
// The sandbox cookie survives a login (src/auth/sandbox.ts reuses the cookie the browser already carries), which is
// what makes a role switch inside one browser the same sandbox: the draft this browser requested as the Supervisor
// is the draft it publishes as the Manager, and no other visitor's numbers move (D-16).
import type { APIRequestContext } from "@playwright/test";

export type DemoRole = "Engineer" | "Reviewing Supervisor" | "Manager" | "Admin";

/** The accounts of this deployment, as scripts/db/seed-m0.ts seeds them: a username and the variable holding its
 *  password. The Admin account is not a demo account and is not distributed, so its variable may well be absent
 *  from a run's environment; a test that needs it skips itself rather than failing. */
const ACCOUNTS: Readonly<Record<DemoRole, { username: string; env: string }>> = {
  Engineer: { username: "engineer_demo", env: "DEMO_ENGINEER_PASSWORD" },
  "Reviewing Supervisor": { username: "supervisor_demo", env: "DEMO_SUPERVISOR_PASSWORD" },
  Manager: { username: "manager_demo", env: "DEMO_MANAGER_PASSWORD" },
  Admin: { username: "admin", env: "ADMIN_PASSWORD" },
};

export function usernameOf(role: DemoRole): string {
  return ACCOUNTS[role].username;
}

/** The name of the variable a role's password is read from; used to state why a test skipped, never its value. */
export function passwordVariable(role: DemoRole): string {
  return ACCOUNTS[role].env;
}

/** True when this run's environment carries the password of that account. The value is never read out of here. */
export function hasPassword(role: DemoRole): boolean {
  const value = process.env[ACCOUNTS[role].env];
  return typeof value === "string" && value.length > 0;
}

/** The reason a test states when it skips itself for a missing account. */
export function missingPassword(role: DemoRole): string {
  return `${passwordVariable(role)} is not in this run's environment, so no ${role} session can be minted`;
}

/**
 * Sign this context in as `role`, keeping the browser's sandbox cookie. Pass `page.request` or `context.request` of
 * a browser context and the session cookie lands in that browser's jar, so the pages it opens afterwards are that
 * role's. Returns the alias and role the route answered with.
 */
export async function signIn(api: APIRequestContext, role: DemoRole): Promise<{ alias: string; role: string }> {
  const account = ACCOUNTS[role];
  const password = process.env[account.env];
  if (!password) throw new Error(missingPassword(role));

  const response = await api.post("/api/auth/login", { data: { username: account.username, password } });
  if (!response.ok()) {
    // The status alone: the body of a login exchange is never printed, failed or not.
    throw new Error(`login as ${account.username} answered ${response.status()}`);
  }
  const body = (await response.json()) as { alias?: unknown; role?: unknown };
  if (typeof body.alias !== "string" || typeof body.role !== "string") {
    throw new Error(`login as ${account.username} answered 200 without an alias and a role`);
  }
  if (body.role !== role) {
    throw new Error(`the ${account.username} account holds the ${body.role} role, not ${role}`);
  }
  return { alias: body.alias, role: body.role };
}
