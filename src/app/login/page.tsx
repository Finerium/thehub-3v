// Surface 14, /login (public; 6.2, D-07, ADR-013): credentials login for the three demo accounts and the Admin
// account; no self-registration, no reset path. The form posts to POST /api/auth/login without client script;
// a failure comes back as ?error=1 with the username kept and never says which field was wrong. A signed-in
// visitor is sent on to `next` or the landing. The keep-alive of D-15 calls this page with no cookie, which never
// touches the database.
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { ACCESS_LEAD, ACCESS_OR, ACCESS_SIGN_IN, ACCESS_TITLE, CREDENTIALS_LINE, DEPLOYMENT_LINE, LOGIN_FAILED, SIGN_IN, TAGLINE, WORDMARK } from "@/auth/copy";
import { LANDING_PATH, getSession, safeNextPath } from "@/auth/session";
import { cx } from "@/components/cx";
import { GlassPanel } from "@/components/GlassPanel";
import s from "./login.module.css";

export const metadata: Metadata = { title: `${SIGN_IN} · ${WORDMARK}` };

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
/**
 * The demo accounts the Committee signs in with, shown on this page by the owner's decision of 2026-10-04: the
 * submission form asks for a link the judges can open without asking for access. Each password is read from the
 * deployment's own environment at request time, so no password is ever written into this repository; an account
 * whose variable is not set is simply not listed. Every one-click button posts to the same POST /api/auth/login as
 * the form below, so no second sign-in path exists.
 */
const DEMO_ACCOUNTS = [
  { role: "Engineer", username: "engineer_demo", env: "DEMO_ENGINEER_PASSWORD", purpose: "Ask, trace, coverage, failure memory" },
  { role: "Reviewing Supervisor", username: "supervisor_demo", env: "DEMO_SUPERVISOR_PASSWORD", purpose: "Request and accept a drafted lesson" },
  { role: "Manager", username: "manager_demo", env: "DEMO_MANAGER_PASSWORD", purpose: "Publish an accepted lesson" },
  { role: "Admin", username: "admin", env: "ADMIN_PASSWORD", purpose: "Corpus versions and the role matrix" },
] as const;

// Reveal order for the load choreography (login.module.css .reveal).
const stagger = (i: number): CSSProperties => ({ "--i": i } as CSSProperties);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  const username = (first(params.username) ?? "").slice(0, 64);
  const failed = first(params.error) !== undefined;

  if (await getSession()) redirect(next ?? LANDING_PATH);
  const accounts = DEMO_ACCOUNTS.map((a) => ({ ...a, password: process.env[a.env] ?? "" })).filter((a) => a.password.length > 0);

  return (
    <main className={s.stage}>
      <div className={s.frame} data-failed={failed ? "" : undefined}>
        <GlassPanel as="section" className={s.panel} aria-labelledby="wordmark">
          <div className={s.body}>
            <header className={cx(s.masthead, s.reveal)} style={stagger(0)}>
              <h1 id="wordmark" className={s.wordmark}>
                {WORDMARK}
              </h1>
              <span className={s.rule} aria-hidden="true" />
              <p className={s.tagline}>{TAGLINE}</p>
            </header>

            {accounts.length > 0 ? (
              <section className={cx(s.access, s.reveal)} style={stagger(1)} aria-labelledby="access-title">
                <h2 id="access-title" className={s.accessTitle}>
                  {ACCESS_TITLE}
                </h2>
                <p className={s.accessLead}>{ACCESS_LEAD}</p>
                <ul className={s.accounts}>
                  {accounts.map((a) => (
                    <li key={a.username} className={s.account} data-account={a.username}>
                      <div className={s.accountText}>
                        <strong>{a.role}</strong>
                        <span className={s.mono}>
                          {a.username} <span aria-hidden="true">·</span> {a.password}
                        </span>
                        <small>{a.purpose}</small>
                      </div>
                      <form action="/api/auth/login" method="post">
                        {next ? <input type="hidden" name="next" value={next} /> : null}
                        <input type="hidden" name="username" value={a.username} />
                        <input type="hidden" name="password" value={a.password} />
                        <button type="submit" className={cx("neu", s.quick)} aria-label={`${ACCESS_SIGN_IN} as ${a.role}`}>
                          <span>{ACCESS_SIGN_IN}</span>
                          <span aria-hidden="true">→</span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <p className={s.accessLead}>{ACCESS_OR}</p>
              </section>
            ) : null}

            <form className={cx(s.form, s.reveal)} style={stagger(1)} action="/api/auth/login" method="post">
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <label className={s.field}>
                <span>Username</span>
                <input
                  className={cx(s.input, s.mono)}
                  name="username"
                  type="text"
                  defaultValue={username}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={64}
                  required
                  autoFocus={username.length === 0}
                />
              </label>
              <label className={s.field}>
                <span>Password</span>
                <input
                  className={s.input}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                  autoFocus={username.length > 0}
                />
              </label>
              {failed ? (
                <p className={s.error} role="alert">
                  <i aria-hidden="true">!</i>
                  <span>{LOGIN_FAILED}</span>
                </p>
              ) : null}
              <button type="submit" className={cx("neu", s.submit)}>
                <span>{SIGN_IN}</span>
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </div>

          <footer className={cx(s.titleblock, s.reveal)} style={stagger(2)}>
            <div className={s.cell}>
              <span>Team</span>
              <strong>3V</strong>
            </div>
            <div className={s.cell}>
              <span>Case</span>
              <strong>CALIBER 2026, Case 1</strong>
            </div>
            <div className={s.cell}>
              <span>Access</span>
              <strong>{CREDENTIALS_LINE}</strong>
            </div>
          </footer>
        </GlassPanel>

        <p className={cx(s.colophon, s.reveal)} style={stagger(3)}>
          <span>{DEPLOYMENT_LINE}</span>
          <span>{WORDMARK}</span>
        </p>
      </div>
    </main>
  );
}
