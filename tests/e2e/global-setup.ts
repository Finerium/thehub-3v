// One login for the whole run (D-07: every surface is behind a session). POST /api/auth/login with the demo
// engineer's credentials, then the session and sandbox cookies are written to STATE_PATH as Playwright storage
// state. The password is read from the environment, or from standard input where an operator pipes it in through
// tools/secret-pipe.sh, and handed straight to the request body: it is never logged, never put on a command line,
// and never written anywhere but the cookie jar the platform returns.
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { OFFLINE_PROJECT, STATE_PATH } from "../../playwright.config";

const USERNAME = "engineer_demo";

/**
 * The projects a run selected. Playwright hands the global setup every configured project rather than the filtered
 * set, so the selection is read from the command line the runner was started with, in both spellings the CLI takes.
 */
function selectedProjects(argv: readonly string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg.startsWith("--project=")) names.push(arg.slice("--project=".length));
    else if (arg === "--project" && argv[i + 1] !== undefined) names.push(argv[i + 1] as string);
  }
  return names;
}


/**
 * The demo Engineer's password, from the environment where a runner puts it (CI hands the job one repository
 * secret), or from standard input where an operator pipes it in without ever putting it in an environment or on a
 * command line:
 *
 *   thehub/tools/secret-pipe.sh DEMO_ENGINEER_PASSWORD -- pnpm exec playwright test --project=chromium
 *
 * The value is read once, handed straight to the request body below and never logged, stored or echoed; a run with
 * neither source stops with the name of the variable and nothing else.
 */
function engineerPassword(): string {
  const fromEnv = process.env.DEMO_ENGINEER_PASSWORD;
  if (fromEnv) return fromEnv;
  if (process.stdin.isTTY !== true) {
    const piped = readFileSync(0, "utf8").trim();
    if (piped.length > 0) return piped;
  }
  throw new Error("DEMO_ENGINEER_PASSWORD is neither in this run's environment nor on standard input (see tools/secret-pipe.sh)");
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  // The offline export project opens a file and aborts every network route, so a run that selects it alone signs
  // in to nothing: Tier A checks AC-DEL-01 on a runner that holds no credential and has no deployment to hold one
  // against. Every other selection, the default included, still needs the session below.
  const selected = selectedProjects(process.argv);
  if (selected.length > 0 && selected.every((name) => name === OFFLINE_PROJECT)) {
    console.log(`e2e: ${OFFLINE_PROJECT} only, no session is minted (the export reaches no server)`);
    return;
  }
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error("no baseURL: set PLAYWRIGHT_BASE_URL");
  const password = engineerPassword();

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.post("/api/auth/login", { data: { username: USERNAME, password } });
    if (!response.ok()) {
      // The body of a failed login is { error } only; it carries no credential.
      throw new Error(`login as ${USERNAME} answered ${response.status()} at ${baseURL}: ${await response.text()}`);
    }
    const body: unknown = await response.json();
    const alias = typeof body === "object" && body !== null && "alias" in body ? String((body as { alias: unknown }).alias) : "";
    if (!alias) throw new Error("login answered 200 without an alias");

    await mkdir(path.dirname(STATE_PATH), { recursive: true });
    await context.storageState({ path: STATE_PATH });
    console.log(`e2e: signed in as ${alias} against ${baseURL}`);
  } finally {
    await context.dispose();
  }
}
