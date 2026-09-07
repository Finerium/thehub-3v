// Surface 3, Trace `/trace/:id` (blueprint 6.2 surface 3, 6.3, 6.4 TraceView, 7.2 dense-operational and
// mechanism-visibility; 9.7 AnswerTrace, 9.13 GatewayCall; AC-ANS-11, AC-UI-02). The replay of one answer, read
// from the immutable answer_trace row: scope resolution, the rule-pack class and version with the moment it was
// decided, the retrieved set, the prompts by version, the verifier verdicts per sentence, the gate results C1 to
// C6 with what each dropped and why, the confidence inputs, the model ids with the gateway configuration hash, the
// corpus version, the server timestamp and the repair rounds (all of it through TraceView), and beneath it the
// provider calls of the run as gateway_call rows with their outcome and latency. A gateway_call row carries hashes,
// ids, tokens and latency and no envelope text, so nothing of a prompt or a reply is readable here; the question
// text is not rendered either (9.7 audit rules). An id no row carries is the designed 404. Nothing is typed: every
// figure comes from the trace row or its gateway_call rows (src/db/queries/traces.ts).
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CopyId } from "@/components/CopyId";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { TraceView } from "@/components/TraceView";
import { traceReplay, type TraceGatewayCall, type TraceReplay } from "@/db/queries/traces";
import { log } from "@/lib/log";
import "@/components/system.css";

export const dynamic = "force-dynamic";

const ROUTE = "/trace/:id";
const HASH_PREFIX = 12;
const MAX_ID = 200;

const TITLE = "Trace";
const SUBTITLE =
  "The replay of one answer, read from the immutable trace row: what was in scope, what the rule pack decided before any provider call, what was retrieved, what the verifier returned sentence by sentence, and what each gate let through.";
const BACK = "Ask";
const CALLS = "Gateway calls";
const CALLS_LEAD = "One row per provider attempt of this run (9.13). A row carries the request and the response as hashes only: no envelope text is stored, so no prompt and no reply is readable here.";
const CALLS_BASIS_EVENT =
  "The gateway_call record carries no trace id, so the rows below are the calls written against this trace's corpus version between the trace's own server timestamp and the audit event that closed it.";
const CALLS_BASIS_DURATION =
  "The gateway_call record carries no trace id, and no audit event closes this trace, so the rows below are the calls written against this trace's corpus version between the trace's own server timestamp and the ask route's maximum duration after it.";
const CALLS_RECONCILED = "reconciled with the count the trace stamped";
const CALLS_UNRECONCILED =
  "The window holds a different number of rows than the count the trace stamped, so it may carry a call of a request that ran beside this one, or miss one written outside it.";
const CALLS_UNSTAMPED = "This trace stamped no call count: it was answered on a path that composes nothing, so the window is reported as it stands.";
const CALLS_EMPTY_TITLE = "No gateway call in this window";
const CALLS_EMPTY_TEXT =
  "A seeded chip is replayed from its stored packet and a refusal is decided by the rule pack before any provider call, so neither writes a row here.";
const CALLS_EMPTY_ACTION = "Ask a question";
const WINDOW = "window";
const STAMPED = "stamped";

const OUTCOME_LABEL = "outcome";
const NOT_STATED = "not stated";
const CONFIG_ONE = "Gateway configuration";
const CONFIG_MANY = "The rows below were written under more than one gateway configuration; each row carries its own hash.";
const ROLES_TITLE = "Model ids and prompts";
const NO_ROLE_RAN =
  "No model id and no prompt version are recorded above: this answer was decided before any role ran, so nothing was pinned for a composer or a verifier to be replayed against. The rule pack's own version and the moment it decided are in the rule-pack panel.";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Trace ${id}` };
}

const CALL_TONE: Record<TraceGatewayCall["outcome"], "verified" | "caveat" | "defect"> = {
  ok: "verified",
  parse_failed: "defect",
  timeout: "defect",
  provider_error: "defect",
  budget_exhausted: "caveat",
};

const HEX_DIGEST = /^[0-9a-f]{32,}$/;

function Hash({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="mono" title={value}>
        {value.slice(0, HASH_PREFIX)}
      </span>
      <CopyId value={value} label={label} />
    </span>
  );
}

/** A prompt version as the pin records it: a short name in full, a digest at its prefix with the full value to copy. */
function PromptVersion({ value, role }: { value: string | null; role: string }) {
  if (value === null) return <span className="text-ink-500">{NOT_STATED}</span>;
  if (!HEX_DIGEST.test(value)) return <span className="mono">{value}</span>;
  return <Hash value={value} label={`${role} prompt version`} />;
}

/** The provider calls of the run: outcome and latency per attempt, hashes only, with the basis of the binding. */
function GatewayCalls({ replay }: { replay: TraceReplay }) {
  const { calls, calls_window: window, calls_expected: expected } = replay;
  const reconciled = expected !== null && expected === calls.length;
  // Every call of one run is made under one gateway configuration (9.13); when they agree the hash is stated once
  // instead of repeating down a column, and a disagreement is stated and the column kept.
  const configs = [...new Set(calls.map((c) => c.gateway_config_sha256))];
  const oneConfig = configs.length === 1 ? configs[0] : null;
  return (
    <GlassPanel className="trace-panel" data-component="gateway-calls" aria-label={CALLS}>
      <div className="blockhead">
        <h3>{CALLS}</h3>
        <span className="flex flex-wrap items-center gap-2">
          <span className="mono text-[12px] text-ink-500">
            {calls.length} in {WINDOW}
            {expected !== null ? ` · ${expected} ${STAMPED}` : ""}
          </span>
          {reconciled ? (
            <span className="badge" data-tone="verified">
              {CALLS_RECONCILED}
            </span>
          ) : null}
        </span>
      </div>
      <p className="m-0 max-w-prose text-[12.5px] text-ink-700">{CALLS_LEAD}</p>
      <p className="m-0 max-w-prose text-[12.5px] text-ink-700">{window.basis === "audit_event" ? CALLS_BASIS_EVENT : CALLS_BASIS_DURATION}</p>
      <p className="mono m-0 text-[12px] text-ink-500">
        {window.from} &rarr; {window.to}
      </p>
      {expected === null ? <p className="m-0 max-w-prose text-[12.5px] text-ink-700">{CALLS_UNSTAMPED}</p> : null}
      {expected !== null && !reconciled ? <p className="m-0 max-w-prose text-[12.5px] text-caveat">{CALLS_UNRECONCILED}</p> : null}
      {oneConfig ? (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="eyebrow">{CONFIG_ONE}</span>
          <Hash value={oneConfig} label="gateway config hash" />
        </p>
      ) : null}
      {calls.length > 0 && !oneConfig ? <p className="m-0 max-w-prose text-[12.5px] text-caveat">{CONFIG_MANY}</p> : null}
      {calls.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="reg" aria-label={CALLS}>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Model id</th>
                <th scope="col">Prompt version</th>
                <th scope="col">Outcome</th>
                <th scope="col" className="num">
                  Latency ms
                </th>
                <th scope="col" className="num">
                  Tokens in
                </th>
                <th scope="col" className="num">
                  Tokens out
                </th>
                <th scope="col">Request</th>
                <th scope="col">Response</th>
                {oneConfig ? null : <th scope="col">Gateway config</th>}
                <th scope="col">Written</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} data-outcome={call.outcome}>
                  <td className="mono whitespace-nowrap text-ink-900">{call.role}</td>
                  <td className="mono whitespace-nowrap">{call.model_id}</td>
                  <td className="whitespace-nowrap">
                    <PromptVersion value={call.prompt_version} role={call.role} />
                  </td>
                  <td>
                    <span className="badge" data-tone={CALL_TONE[call.outcome]}>
                      {call.outcome}
                    </span>
                  </td>
                  <td className="num whitespace-nowrap">{call.latency_ms}</td>
                  <td className="num whitespace-nowrap">{call.input_tokens}</td>
                  <td className="num whitespace-nowrap">{call.output_tokens}</td>
                  <td>
                    <Hash value={call.request_sha256} label={`${call.role} request hash`} />
                  </td>
                  <td>
                    <Hash value={call.response_sha256} label={`${call.role} response hash`} />
                  </td>
                  {oneConfig ? null : (
                    <td>
                      <Hash value={call.gateway_config_sha256} label="gateway config hash" />
                    </td>
                  )}
                  <td className="mono whitespace-nowrap">
                    <span className="block text-ink-500">{call.created_at.slice(0, 10)}</span>
                    <span className="block">{call.created_at.slice(11)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={CALLS_EMPTY_TITLE} explanation={CALLS_EMPTY_TEXT} action={{ href: "/ask", label: CALLS_EMPTY_ACTION }} />
      )}
    </GlassPanel>
  );
}

export default async function TracePage({ params }: Props) {
  const id = (await params).id.slice(0, MAX_ID);

  let replay: TraceReplay | null;
  try {
    replay = await traceReplay(id);
  } catch (error) {
    log.error({ event: "trace.read_failed", route: ROUTE, err: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The replay reads the immutable trace row and the gateway calls of its run at request time. The read failed, so nothing is shown in their place."
        reason={`trace ${id}`}
        next={{ href: "/ask", label: BACK }}
      />
    );
  }

  if (!replay) {
    return (
      <DesignedState
        code="404"
        title="No trace at this id"
        explanation="A trace is written once, when an answer is served, and is never updated or removed. This id belongs to no trace on this deployment: it may come from another deployment, from a database that has been reseeded, or from a request that never reached the answer lane."
        reason={`trace ${id}`}
        next={{ href: "/ask", label: BACK }}
      />
    );
  }

  const { trace, version } = replay;
  // A refusal and a search close before any role runs, so the trace pins no model and no prompt: the empty panels
  // above are a fact of the path, stated here rather than left blank (6.3).
  const noRoleRan = trace.prompts.length === 0 && Object.keys(trace.model_ids).length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">{TITLE}</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">{SUBTITLE}</p>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="tag" data-tone={trace.outcome === "refusal" ? "defect" : trace.outcome === "answer" ? "verified" : "caveat"}>
            {OUTCOME_LABEL} {trace.outcome}
          </span>
          <Link href="/ask" className="draw">
            {BACK} <span aria-hidden>&rarr;</span>
          </Link>
        </p>
      </header>

      <div className="rise" style={stagger(1)}>
        <TraceView trace={trace} corpusVersionLabel={version?.label} />
      </div>

      {noRoleRan ? (
        <div className="rise" style={stagger(2)}>
          <GlassPanel className="trace-panel" data-component="no-role-ran" aria-label={ROLES_TITLE}>
            <h3>{ROLES_TITLE}</h3>
            <p className="m-0 max-w-prose text-[12.5px] text-ink-700">{NO_ROLE_RAN}</p>
          </GlassPanel>
        </div>
      ) : null}

      <div className="rise" style={stagger(3)}>
        <GatewayCalls replay={replay} />
      </div>
    </div>
  );
}
