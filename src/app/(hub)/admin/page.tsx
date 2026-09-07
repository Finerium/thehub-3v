// Surface 13, Admin (blueprint 6.2 surface 13, 6.3, 9.7, 9.9; register tactile-transactional, 7.2). Admin only:
// every other role gets the designed 403 and the auth.role_violation event that goes with it, written before the
// sheet renders. The sheet carries the corpus versions with actor, timestamp, active flag and manifest hash and the
// activation itself; the accounts with their roles beside the 9.9 matrix; the provider pins and prompt versions as
// read from src/gateway/config.ts on the server, never from a provider call; the rate-limit and budget constants as
// configured; and the recent audit rows.
//
// The two safety events are the one place a request text exists in the log (9.7). They are out of scope of the
// recent-rows panel entirely, and open only under ?safety=open, which writes audit.safety_events_read before the
// rows are drawn, so the read of a request text is itself in the log.
//
// No figure on this sheet is typed: the versions, accounts and audit rows are database rows; the pins, limits,
// budgets and prices are the configuration constants of src/gateway/config.ts and src/lib/ratelimit.ts, read here on
// the server. Nothing on the sheet aggregates by person: an account is an alias and a role, and the log is ordered
// by time, never grouped by who acted.
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { recordRoleViolation } from "@/auth/authorize";
import { can, MATRIX, PERMISSIONS } from "@/auth/matrix";
import { requireSession } from "@/auth/session";
import { AuditList, AuditRow } from "@/components/AuditRow";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { VersionBadge } from "@/components/VersionBadge";
import {
  auditActionCounts,
  auditTotals,
  listAccounts,
  recentAudit,
  ROLE_ORDER,
  SAFETY_ACTIONS,
  SAFETY_READ_ACTION,
  versionChildCounts,
} from "@/db/queries/admin-view";
import { listVersions } from "@/db/versions";
import {
  GATEWAY_CONFIG_SHA256,
  PRICE_SOURCE,
  PRICE_USD_PER_1M_TOKENS,
  PROMPT_FILES,
  ROLE_TABLE,
  TASKS,
  USD_IDR_RATE,
  USD_IDR_RATE_SOURCE,
  type ChatTask,
  type Task,
} from "@/gateway/config";
import { writeAudit } from "@/lib/audit";
import { LIMITS, WINDOW_SECONDS } from "@/lib/ratelimit";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { AdminClient } from "./AdminClient";
import "@/components/system.css";

export const metadata: Metadata = { title: "Admin" };

// Versions, accounts and the log are read at request time; an activation is visible on the next render.
export const dynamic = "force-dynamic";

const ROUTE = "/admin";
const RECENT_ROWS = 24;
const SAFETY_ROWS = 50;
const HASH_PREFIX = 12;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const count = (n: number): string => n.toLocaleString("en-US");

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A configuration constant with the file it was read from named beside it; never a value typed onto the sheet. */
function Constant({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mono mt-1 text-[19px] leading-tight font-medium text-ink-900">{value}</p>
      {note ? <p className="mt-1 max-w-[40ch] text-[12px] leading-snug text-ink-700">{note}</p> : null}
    </div>
  );
}

function Yes({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="badge" data-tone="verified">
        yes
      </span>
      {children ? <span className="text-[11px] leading-snug text-ink-700">{children}</span> : null}
    </span>
  );
}

function No() {
  return (
    <span className="badge" data-tone="neutral">
      no
    </span>
  );
}

export default async function AdminPage({ searchParams }: Props) {
  const [user, query] = await Promise.all([requireSession(), searchParams]);

  // 6.3: the designed 403 with its audit event. The role check is the 9.9 matrix, the same table the routes ask.
  if (!can(user.role, "activate_version")) {
    await recordRoleViolation(user, "activate_version", ROUTE);
    return (
      <DesignedState
        code="403"
        tone="defect"
        title="Admin is closed to this role"
        explanation="The Admin sheet sits behind the activate_version column of the permission matrix, which only the Admin role holds. The refusal was written to the audit log as an auth.role_violation event naming this alias, this role and this route before the sheet rendered."
        reason={`role=${user.role} permission=activate_version route=${ROUTE}`}
        next={{ href: "/", label: "Back to Home" }}
      />
    );
  }

  const safetyOpen = first(query.safety) === "open";

  let versions: Awaited<ReturnType<typeof listVersions>>;
  let children: Awaited<ReturnType<typeof versionChildCounts>>;
  let accounts: Awaited<ReturnType<typeof listAccounts>>;
  let recent: Awaited<ReturnType<typeof recentAudit>>;
  let counts: Awaited<ReturnType<typeof auditActionCounts>>;
  let totals: Awaited<ReturnType<typeof auditTotals>>;
  let safety: Awaited<ReturnType<typeof recentAudit>> = [];
  try {
    [versions, children, accounts, recent, counts, totals] = await Promise.all([
      listVersions(1, 200),
      versionChildCounts(),
      listAccounts(),
      recentAudit(RECENT_ROWS),
      auditActionCounts(),
      auditTotals(),
    ]);
    if (safetyOpen) safety = await recentAudit(SAFETY_ROWS, { safety: true });
  } catch (error) {
    log.error({ event: "admin.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The Admin sheet reads the corpus versions, the accounts and the audit log at request time. The read failed, so nothing is shown in their place."
        next={{ href: ROUTE, label: "Try again" }}
      />
    );
  }

  // 9.7: reading the safety events is itself an event. It is written after the rows are read and carries their
  // count and the two actions in scope, never a request text.
  let safetyReadId: string | null = null;
  if (safetyOpen) {
    safetyReadId = await getRequestId();
    try {
      await writeAudit({
        id: safetyReadId,
        actor_alias: user.alias,
        actor_role: user.role,
        action: SAFETY_READ_ACTION,
        entity: "audit_log",
        entity_id: "safety_events",
        payload: { actions: [...SAFETY_ACTIONS], rows: safety.length },
        trace_id: null,
        route: ROUTE,
      });
    } catch (error) {
      log.error({ event: "admin.safety_read_audit_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
      safetyReadId = null;
    }
  }

  const active = versions.find((v) => v.is_active) ?? null;
  const ledger = versions.map((v) => ({ ...v, child_count: children.get(v.id) ?? 0 }));
  const chatTasks = TASKS.filter((t): t is ChatTask => t !== "embedding");

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">Admin</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            The four things one account may change or read here: which corpus version is active, who holds which role, what the
            gateway is pinned to, and what the log recorded. Admin holds no drafting, no review and no publication right, so
            nothing on this sheet can write a lesson, decide a draft or publish one.
          </p>
        </div>
        {active ? <VersionBadge label={active.label} digestPrefix={active.corpus_sha256.slice(0, 8)} active /> : null}
      </header>

      {/* 1. Corpus versions and the activation: the one action on the sheet. */}
      <div className="rise" style={stagger(1)}>
        <AdminClient versions={ledger} canActivate />
      </div>

      {/* 2. Accounts and roles, beside the matrix that decides what each role may do. */}
      <section className="rise" style={stagger(2)} aria-labelledby="accounts-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="accounts-heading" className="text-[20px]">
            Accounts and roles
          </h2>
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{count(accounts.length)}</span> accounts; no credential column is read by this
            page, so none can be rendered
          </span>
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <GlassPanel className="p-5" aria-label="Accounts">
            <table className="reg">
              <caption className="sr-only">The accounts of this deployment with their aliases and roles</caption>
              <thead>
                <tr>
                  <th scope="col">Alias</th>
                  <th scope="col">Role</th>
                  <th scope="col">Kind</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                      {a.alias}
                    </th>
                    <td className="whitespace-nowrap text-[12.5px]">{a.role}</td>
                    <td className="whitespace-nowrap text-[12px] text-ink-700">{a.is_demo ? "demo account" : "not distributed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              An account is an alias and a role. There is no self-registration, no reset path and no password field anywhere in
              this product; credentials are set outside it and never travel through a surface.
            </p>
          </GlassPanel>

          <GlassPanel className="p-5" aria-label="The permission matrix">
            <div className="blockhead">
              <h3>The matrix every route asks</h3>
              <span className="text-[12px] text-ink-500">src/auth/matrix.ts, the 9.9 table as data</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="reg" data-component="permission-matrix">
                <caption className="sr-only">Permission by role, as the routes read it</caption>
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    {ROLE_ORDER.map((role) => (
                      <th key={role} scope="col" className="whitespace-nowrap">
                        {role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p) => (
                    <tr key={p}>
                      <th scope="row" className="mono text-[12px] whitespace-nowrap">
                        {p}
                      </th>
                      {ROLE_ORDER.map((role) => (
                        <td key={role} data-current={role === user.role ? "" : undefined}>
                          {MATRIX[role][p] ? (
                            <Yes>{role === "Manager" && p === "decide" ? "reject from accepted only" : null}</Yes>
                          ) : (
                            <No />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              Publication is one column held by one role, and a human presses it: the Manager, through the G3 gate, in one
              transaction. Admin holds activate_version and nothing else that writes.
            </p>
          </GlassPanel>
        </div>
      </section>

      {/* 3. Provider pins and prompt versions, read from configuration. */}
      <section className="rise" style={stagger(3)} aria-labelledby="pins-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pins-heading" className="text-[20px]">
            Provider pins and prompt versions
          </h2>
          <span className="text-[12px] text-ink-500">
            read from src/gateway/config.ts on the server; this page makes no provider call
          </span>
        </div>
        <GlassPanel className="mt-4 p-5" aria-label="The gateway role table">
          <div className="overflow-x-auto">
            <table className="reg" data-component="gateway-role-table">
              <caption className="sr-only">One row per gateway task with its provider, model id, effort and prompt version</caption>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Role</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Model id</th>
                  <th scope="col">Effort</th>
                  <th scope="col" className="num">
                    Max tokens
                  </th>
                  <th scope="col" className="num">
                    Timeout ms
                  </th>
                  <th scope="col">Prompt file</th>
                  <th scope="col">Prompt version</th>
                </tr>
              </thead>
              <tbody>
                {TASKS.map((task: Task) => {
                  const cfg = ROLE_TABLE[task];
                  return (
                    <tr key={task}>
                      <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                        {task}
                      </th>
                      <td className="mono whitespace-nowrap text-[12px]">{cfg.role}</td>
                      <td className="mono whitespace-nowrap text-[12px]">{cfg.provider}</td>
                      <td className="mono whitespace-nowrap text-[12px] text-ink-900">{cfg.model_id}</td>
                      <td className="mono whitespace-nowrap text-[12px]">{cfg.effort}</td>
                      <td className="mono num">{count(cfg.max_tokens)}</td>
                      <td className="mono num">{count(cfg.timeout_ms)}</td>
                      <td className="mono text-[11.5px]">
                        {task === "embedding" ? (
                          <span className="font-sans text-ink-500">no prompt file; the embedding role runs locally</span>
                        ) : (
                          PROMPT_FILES[task]
                        )}
                      </td>
                      <td className="mono text-[11.5px] break-all">
                        {cfg.prompt_version === null ? (
                          <span className="font-sans text-ink-500">none</span>
                        ) : (
                          cfg.prompt_version.slice(0, HASH_PREFIX)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-prose text-[12.5px] text-ink-700">
            A prompt version is the SHA-256 of the prompt file&rsquo;s bytes, read once at module load; the whole table is hashed
            into a configuration digest that is stamped on every gateway call, so a call can be traced back to the exact table
            it ran under. The verifier keeps its own prompt file and its own row, and never sees the question.
          </p>
          <p className="mono mt-2 text-[11.5px] text-ink-500">
            gateway_config_sha256 {GATEWAY_CONFIG_SHA256.slice(0, HASH_PREFIX)}
          </p>
        </GlassPanel>
      </section>

      {/* 4. The constants: rate limits, budgets, prices. */}
      <section className="rise" style={stagger(4)} aria-labelledby="limits-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="limits-heading" className="text-[20px]">
            Rate limits and budgets
          </h2>
          <span className="text-[12px] text-ink-500">configuration policy, not a measurement</span>
        </div>

        <GlassPanel className="mt-4 p-6" aria-label="Rate limits">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Constant
              label="Asks per account"
              value={count(LIMITS.ask)}
              note={`Fixed ${count(WINDOW_SECONDS)}-second windows on the database clock. A hit above the limit renders the designed 429 naming the limit and the moment it resets.`}
            />
            <Constant label="Draft creations per account" value={count(LIMITS.draft)} note="Counted in the same window as the asks, keyed by account." />
            <Constant label="Requests per address" value={count(LIMITS.addr)} note="Keyed by the client address the platform forwards, so one browser cannot spend the deployment." />
            <Constant
              label="Window"
              value={`${count(WINDOW_SECONDS)} s`}
              note="The counter lives in Postgres, so no memory is load-bearing and the count holds across function instances."
            />
          </div>
        </GlassPanel>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <GlassPanel className="p-5" aria-label="Daily budgets per role">
            <div className="blockhead">
              <h3>Daily budget per role</h3>
              <span className="text-[12px] text-ink-500">checked before every live call; at or above either cap no call is made</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="reg">
                <caption className="sr-only">Token and spend caps per gateway task</caption>
                <thead>
                  <tr>
                    <th scope="col">Task</th>
                    <th scope="col" className="num">
                      Tokens per day
                    </th>
                    <th scope="col" className="num">
                      Spend cap, IDR per day
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chatTasks.map((task) => (
                    <tr key={task}>
                      <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                        {task}
                      </th>
                      <td className="mono num">{count(ROLE_TABLE[task].budget.tokens_per_day)}</td>
                      <td className="mono num">{count(ROLE_TABLE[task].budget.spend_cap_idr_per_day)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                      embedding
                    </th>
                    <td className="text-[12px] text-ink-500" colSpan={2}>
                      local, no provider, never metered
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              Both AG-4 tasks share the verifier&rsquo;s row and its budget. The spend estimate charges every input token at the
              uncached price, so it over-estimates and never under.
            </p>
          </GlassPanel>

          <GlassPanel className="p-5" aria-label="The prices the estimate uses">
            <div className="blockhead">
              <h3>Prices behind the estimate</h3>
            </div>
            <dl className="fields mt-3">
              <div className="contents">
                <dt>Input, USD per 1M</dt>
                <dd className="mono">{PRICE_USD_PER_1M_TOKENS.input}</dd>
              </div>
              <div className="contents">
                <dt>Cached input, USD per 1M</dt>
                <dd className="mono">{PRICE_USD_PER_1M_TOKENS.cached_input}</dd>
              </div>
              <div className="contents">
                <dt>Output, USD per 1M</dt>
                <dd className="mono">{PRICE_USD_PER_1M_TOKENS.output}</dd>
              </div>
              <div className="contents">
                <dt>USD to IDR</dt>
                <dd className="mono">{USD_IDR_RATE}</dd>
              </div>
            </dl>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              Prices read from the provider&rsquo;s published list on {PRICE_SOURCE.read_on}; the rate as of{" "}
              {USD_IDR_RATE_SOURCE.as_of.slice(0, 10)}. Both are constants in the configuration file, not a live lookup.
            </p>
          </GlassPanel>
        </div>
      </section>

      {/* 5. The log. */}
      <section id="audit" className="rise" style={stagger(5)} aria-labelledby="audit-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="audit-heading" className="text-[20px]">
            Audit log
          </h2>
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{count(totals.total)}</span> rows; UPDATE and DELETE are revoked on the table at
            the grant level
          </span>
        </div>

        <GlassPanel className="mt-4 p-5" aria-label="What the log holds">
          <div className="blockhead">
            <h3>What the log holds</h3>
            <span className="text-[12px] text-ink-500">one count per action over every row</span>
          </div>
          {counts.length === 0 ? (
            <EmptyState className="mt-3" title="The log is empty" explanation="No action has been recorded against any corpus version yet." />
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2 p-0">
              {counts.map((c) => (
                <li key={c.action} className="chip">
                  <span className="mono text-ink-900">{c.action}</span>
                  <span className="mono text-ink-500">{count(c.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel className="mt-4 p-5" aria-labelledby="recent-heading">
          <div className="blockhead">
            <h3 id="recent-heading">The most recent rows</h3>
            <span className="text-[12px] text-ink-500">
              newest first, the two safety events excluded; no question text appears on this panel
            </span>
          </div>
          {recent.length === 0 ? (
            <EmptyState className="mt-3" title="Nothing recorded yet" explanation="The log writes on an answer, a draft transition, a publication, an activation and a refused request." />
          ) : (
            <AuditList className="mt-2" aria-label="The most recent audit rows">
              {recent.map((entry) => (
                <AuditRow key={`${entry.event.id}-${entry.event.action}`} event={entry.event} />
              ))}
            </AuditList>
          )}
        </GlassPanel>

        {/* The safety events: Admin only, opened deliberately, and the read is itself recorded. */}
        <GlassPanel id="safety" className="mt-4 p-5" aria-labelledby="safety-heading">
          <div className="blockhead">
            <h3 id="safety-heading">Safety events</h3>
            <span className="text-[12px] text-ink-500">
              <span className="mono text-ink-900">{count(totals.safety)}</span> rows across the two safety actions
            </span>
          </div>
          <p className="mt-2 max-w-prose text-[12.5px] text-ink-700">
            A refused or served safety request is the one event whose payload carries the request text as it was typed,
            pseudonymised, with the rule and the phrase that matched. It is readable by Admin alone, it is retained for the
            deployment&rsquo;s life rather than thirty days, and opening it writes {SAFETY_READ_ACTION} against this alias.
          </p>

          {safetyOpen ? (
            <>
              <p className="mono mt-3 text-[11.5px] text-caveat">
                {safetyReadId === null
                  ? `${SAFETY_READ_ACTION} could not be written; the rows below were read anyway and this line records that the event is missing`
                  : `${SAFETY_READ_ACTION} written, event ${safetyReadId}`}
              </p>
              {safety.length === 0 ? (
                <EmptyState
                  className="mt-3"
                  title="No safety event has been recorded"
                  explanation="The rule pack has refused or served no request on this deployment yet."
                  action={{ href: ROUTE, label: "Close the safety view" }}
                />
              ) : (
                <>
                  <AuditList className="mt-2" aria-label="The safety events with their request text">
                    {safety.map((entry) => (
                      <AuditRow key={`${entry.event.id}-${entry.event.action}`} event={entry.event} safety={entry.safety} />
                    ))}
                  </AuditList>
                  <p className="mt-3">
                    <Link href={ROUTE} className="draw text-[12.5px]">
                      Close the safety view
                    </Link>
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="mt-3">
              <Link href={`${ROUTE}?safety=open#safety`} className="neu" data-size="sm">
                Open the safety events
                <span aria-hidden className="mono">
                  &rarr;
                </span>
              </Link>
            </p>
          )}
        </GlassPanel>
      </section>
    </div>
  );
}
