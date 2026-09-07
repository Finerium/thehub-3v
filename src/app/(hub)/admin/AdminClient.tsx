"use client";

// Surface 13, Admin, the one interactive half (blueprint 6.2 surface 13, 7.2 tactile-transactional): the corpus
// version ledger and the activation. Everything else on the sheet is server-rendered and reads nothing this file
// touches.
//
// Activation is the only action on the whole sheet, so it is drawn as one: a neumorphic control that arms on the
// first press and commits on the second, and a state line that says what the transaction did. The request goes to
// POST /api/admin/corpus/activate, which holds the transaction, the lineage rule and the corpus.version_activated
// event (src/db/versions.ts); this component decides nothing about the corpus and computes no figure of its own.
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { auditStamp } from "@/components/AuditRow";
import { cx } from "@/components/cx";
import { DesignedState } from "@/components/DesignedState";
import { GlassPanel } from "@/components/GlassPanel";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import type { CorpusVersion } from "@/contracts/generated/serving";

export type AdminVersion = CorpusVersion & { child_count: number };

export type AdminClientProps = {
  versions: AdminVersion[];
  /** False while another visitor's activation is in flight is not modelled; the route serialises activations. */
  canActivate: boolean;
};

const ACTIVATE_ROUTE = "/api/admin/corpus/activate";
const HASH_PREFIX = 12;

type Failure = { code: string; status: number; detail: string | null };

// The route's body is { error, request_id, ... }; a field it does not send is not invented here.
async function activate(versionId: string): Promise<Failure | null> {
  let response: Response;
  try {
    // egress: none (same-origin routes of this application; the provider is reached only by src/gateway)
    response = await fetch(ACTIVATE_ROUTE, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    });
  } catch {
    return { code: "unreachable", status: 0, detail: null };
  }
  if (response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof record.error === "string" ? record.error : "unknown";
  const requestId = typeof record.request_id === "string" ? record.request_id : null;
  return { code, status: response.status, detail: requestId };
}

const FAILURE_TITLE: Record<string, string> = {
  forbidden: "This role does not hold the activation column",
  unauthenticated: "The session has expired",
  not_found: "No corpus version carries that id",
  invalid_body: "The route refused the request body",
  unreachable: "The activation route did not answer",
};

const FAILURE_EXPLANATION: Record<string, string> = {
  forbidden:
    "Activation sits behind the activate_version column of the 9.9 matrix, which only Admin holds. The refusal was recorded as an auth.role_violation event before the response was written.",
  unauthenticated: "The session behind this browser is gone or expired. Sign in again and the ledger will reload.",
  not_found: "The ledger was drawn from a read that no longer matches the table. Reload the sheet and try again.",
  invalid_body: "The request named no version id the route would accept. Reload the sheet and try again.",
  unreachable: "The request did not reach the route, so nothing was activated. The active version is unchanged.",
};

/** The stamped pins of one version: what that corpus version was built with, not what the app runs now. */
function StampedPins({ pins }: { pins: CorpusVersion["model_pins"] }) {
  const rows = Object.entries(pins);
  if (rows.length === 0) return null;
  return (
    <details className="disclose">
      <summary>
        <span className="text-[12px] text-ink-700">{rows.length} stamped model pins</span>
      </summary>
      <div className="disclose-body">
        <table className="reg">
          <caption className="sr-only">The model pins this corpus version was built with</caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Provider</th>
              <th scope="col">Model id</th>
              <th scope="col">Prompt version</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([role, pin]) => (
              <tr key={role}>
                <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                  {role}
                </th>
                <td className="mono whitespace-nowrap text-[12px]">{pin.provider}</td>
                <td className="mono whitespace-nowrap text-[12px] text-ink-900">{pin.model_id}</td>
                <td className="mono text-[11.5px] break-all">
                  {pin.prompt_version === null ? <span className="text-ink-500">no prompt file for this role</span> : pin.prompt_version.slice(0, HASH_PREFIX)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function AdminClient({ versions, canActivate }: AdminClientProps) {
  const router = useRouter();
  const [armed, setArmed] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const commit = (versionId: string) => {
    setBusy(versionId);
    setFailure(null);
    void activate(versionId).then((result) => {
      setBusy(null);
      setArmed(null);
      if (result) {
        setFailure(result);
        return;
      }
      startTransition(() => router.refresh());
    });
  };

  return (
    <GlassPanel className="p-6" aria-labelledby="versions-heading" data-component="version-ledger">
      <div className="blockhead">
        <h2 id="versions-heading" className="text-[20px]">
          Corpus versions
        </h2>
        <p className="max-w-[62ch] text-[12.5px] text-ink-700">
          Newest first. Exactly one version is active: a partial unique index in the schema admits one, and activation is one
          transaction that flips the flag, re-applies the lineage rule to the document revisions and writes
          corpus.version_activated. Nothing is ever deleted, so a version stays readable after another takes over.
        </p>
      </div>

      {failure ? (
        <DesignedState
          inline
          className="mt-4"
          code={failure.status === 0 ? "no answer" : String(failure.status)}
          tone="defect"
          title={FAILURE_TITLE[failure.code] ?? "The activation was refused"}
          explanation={
            FAILURE_EXPLANATION[failure.code] ??
            "The route refused the activation and named a machine-readable reason. Nothing was activated; the active version is unchanged."
          }
          reason={failure.detail === null ? failure.code : `${failure.code} request_id=${failure.detail}`}
          next={{ href: "/admin", label: "Reload the ledger" }}
        />
      ) : null}

      <ol className="mt-5 m-0 list-none p-0">
        {versions.map((v, i) => {
          const isArmed = armed === v.id;
          const isBusy = busy === v.id;
          return (
            <li
              key={v.id}
              className="rise grid grid-cols-[16px_minmax(0,1fr)] gap-x-4 border-b border-edge/70 py-5 last:border-b-0"
              style={{ "--i": Math.min(i, 6) } as CSSProperties}
              data-version={v.id}
              data-active={v.is_active ? "" : undefined}
            >
              {/* One node per version, filled where the version is active. No line is drawn between rows: lineage
                  is the parent field below, and a rail between unrelated roots would draw a descent that is not there. */}
              <div aria-hidden>
                <span
                  className={cx(
                    "mt-[5px] block h-[15px] w-[15px] rounded-[4px]",
                    v.is_active ? "bg-verified" : "bg-paper-deep shadow-[inset_0_0_0_1.5px_var(--ink-500)]",
                  )}
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-[19px]">{v.label}</h3>
                    <span className="mono text-[12px] break-all text-ink-500">{v.id}</span>
                    {v.is_active ? (
                      <span className="badge" data-tone="verified">
                        active
                      </span>
                    ) : null}
                  </div>

                  {v.is_active ? (
                    <p className="text-[12px] text-ink-500">
                      This version is what every unsandboxed read resolves against.
                    </p>
                  ) : canActivate ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {isArmed ? (
                        <>
                          <NeumorphicChip
                            size="sm"
                            active
                            disabled={isBusy || pending}
                            onClick={() => commit(v.id)}
                            aria-label={`Confirm the activation of corpus version ${v.label}`}
                          >
                            {isBusy || pending ? "Activating" : `Confirm: make ${v.label} active`}
                          </NeumorphicChip>
                          <button type="button" className="draw text-[12.5px] text-ink-700" onClick={() => setArmed(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <NeumorphicChip
                          size="sm"
                          disabled={busy !== null || pending}
                          onClick={() => {
                            setFailure(null);
                            setArmed(v.id);
                          }}
                          aria-label={`Activate corpus version ${v.label}`}
                        >
                          Activate
                        </NeumorphicChip>
                      )}
                    </span>
                  ) : null}
                </div>

                {isArmed ? (
                  <p className="mt-2 max-w-[72ch] text-[12.5px] text-caveat">
                    Confirming changes what every reader of this deployment resolves against: the active flag moves to{" "}
                    <span className="mono">{v.label}</span>, the current document revisions are recomputed over its lineage, and the
                    transaction writes corpus.version_activated under this account&rsquo;s alias.
                  </p>
                ) : null}

                <dl className="fields mt-3">
                  <div className="contents">
                    <dt>Created</dt>
                    <dd className="mono">
                      {auditStamp(v.created_at)} <span className="text-ink-500">by</span> {v.created_by_alias}
                    </dd>
                  </div>
                  <div className="contents">
                    <dt>Activated</dt>
                    <dd className="mono">
                      {v.activated_at === null || v.activated_by_alias === null ? (
                        <span className="font-sans text-ink-500">never activated</span>
                      ) : (
                        <>
                          {auditStamp(v.activated_at)} <span className="text-ink-500">by</span> {v.activated_by_alias}
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="contents">
                    <dt>Parent</dt>
                    <dd className="mono break-all">
                      {v.parent_version_id ?? <span className="font-sans text-ink-500">no parent; this version is a root</span>}
                    </dd>
                  </div>
                  <div className="contents">
                    <dt>Children</dt>
                    <dd className="mono">
                      {v.child_count === 0 ? <span className="font-sans text-ink-500">none</span> : v.child_count}
                    </dd>
                  </div>
                  <div className="contents">
                    <dt>Manifest hash</dt>
                    <dd className="mono text-[11.5px] break-all">{v.manifest_sha256}</dd>
                  </div>
                  <div className="contents">
                    <dt>Corpus hash</dt>
                    <dd className="mono text-[11.5px] break-all">{v.corpus_sha256}</dd>
                  </div>
                  <div className="contents">
                    <dt>Extractor</dt>
                    <dd className="mono text-[11.5px] break-all">{v.extractor}</dd>
                  </div>
                  <div className="contents">
                    <dt>Embedding</dt>
                    <dd className="mono text-[11.5px] break-all">
                      {v.embedding_model} <span className="text-ink-500">dim</span> {v.embedding_dim}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <StampedPins pins={v.model_pins} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </GlassPanel>
  );
}
