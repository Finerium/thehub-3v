// One login for the whole run (D-07: every surface is behind a session). POST /api/auth/login with the demo
// engineer's credentials, then the session and sandbox cookies are written to STATE_PATH as Playwright storage
// state. The password is read from the environment and handed straight to the request body: it is never logged,
// never put on a command line, and never written anywhere but the cookie jar the platform returns.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { STATE_PATH } from "../../playwright.config";

const USERNAME = "engineer_demo";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error("no baseURL: set PLAYWRIGHT_BASE_URL");
  const password = process.env.DEMO_ENGINEER_PASSWORD;
  if (!password) throw new Error("DEMO_ENGINEER_PASSWORD is not set in the environment (run through the dotenv wrapper)");

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
