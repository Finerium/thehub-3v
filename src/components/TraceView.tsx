// Blueprint 6.4 TraceView: the replay panels of surface 3 (6.2), typed by AnswerTrace (9.7): identity and model
// ids, scope resolution, the rule-pack decision, the retrieved set, the prompts by version, the verifier verdicts
// per sentence, the gate results C1 to C6 with their detail lines, the confidence band with its inputs. Every id
// carries copy-to-clipboard (CopyId). The question text is not rendered: the replay shows what was decided, not
// what was typed (9.7 audit rules; the Admin safety view is the only place a request text appears).
import type { AnswerTrace } from "@/contracts/generated/serving";
import { ConfidenceBand } from "./ConfidenceBand";
import { CopyId } from "./CopyId";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import { GATES, VerdictStrip } from "./VerdictStrip";
import "./system.css";

export type TraceViewProps = {
  trace: AnswerTrace;
  /** The active version's label beside the version id, when the surface resolves it. */
  corpusVersionLabel?: string;
  className?: string;
};

const HASH_PREFIX = 12;
const IDENTITY = "Trace";
const SCOPE = "Scope resolution";
const RULEPACK = "Rule pack";
const RETRIEVED = "Retrieved set";
const PROMPTS = "Prompts by version";
const VERDICTS = "Verifier verdicts per sentence";
const GATES_TITLE = "Gate results";
const CONFIDENCE = "Confidence inputs";
const MODELS = "Model ids";
const NONE_RETRIEVED = "No chunk was retrieved.";
const NONE_VERDICT = "No sentence reached the verifier.";
const CLASS_TONE: Record<AnswerTrace["rulepack"]["class"], "neutral" | "defect" | "caveat"> = {
  none: "neutral",
  defeat: "defect",
  permanent_change: "defect",
  documented_bypass: "caveat",
};
const INPUT_LABEL: Record<keyof AnswerTrace["confidence"]["inputs"], string> = {
  question_coverage: "question coverage",
  source_count: "source count",
  approval_share: "approval share",
};

function Id({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span className="id mono" title={value}>
        {value}
      </span>
      <CopyId value={value} label={label} />
    </span>
  );
}

export function TraceView({ trace, corpusVersionLabel, className }: TraceViewProps) {
  const inputs = (Object.keys(INPUT_LABEL) as Array<keyof typeof INPUT_LABEL>).map((k) => [INPUT_LABEL[k], trace.confidence.inputs[k]] as const);
  return (
    <div className={cx("trace", className)} data-component="trace-view" data-trace={trace.id}>
      <GlassPanel className="trace-panel" data-span="2" aria-labelledby={`trace-${trace.id}-identity`}>
        <div className="blockhead">
          <h3 id={`trace-${trace.id}-identity`}>{IDENTITY}</h3>
          <span className="flex flex-wrap items-center gap-2">
            <span className="tag" data-tone={trace.outcome === "refusal" ? "defect" : trace.outcome === "answer" ? "verified" : "caveat"}>
              {trace.outcome}
            </span>
            {trace.template ? <span className="tag">{trace.template}</span> : null}
            <span className="tag">{trace.language_detected}</span>
            <span className="tag">{trace.packet.mode}</span>
          </span>
        </div>
        <dl className="fields">
          <dt>Trace id</dt>
          <dd>
            <Id value={trace.id} label="trace id" />
          </dd>
          <dt>Corpus version</dt>
          <dd>
            <Id value={trace.corpus_version_id} label="corpus version id" />
            {corpusVersionLabel ? <span className="mono text-ink-500"> {corpusVersionLabel}</span> : null}
          </dd>
          <dt>Server timestamp</dt>
          <dd className="mono">{trace.server_ts}</dd>
          <dt>Role alias</dt>
          <dd className="mono">{trace.user_alias}</dd>
          <dt>Repair rounds</dt>
          <dd className="mono">{trace.repair_rounds}</dd>
        </dl>
        <p className="eyebrow mt-2">{MODELS}</p>
        <dl className="fields">
          {Object.entries(trace.model_ids).map(([role, model]) => (
            <div key={role} className="contents">
              <dt className="mono">{role}</dt>
              <dd>
                <Id value={model} label={`${role} model id`} />
              </dd>
            </div>
          ))}
        </dl>
      </GlassPanel>

      <div className="trace-grid">
        <GlassPanel className="trace-panel" aria-label={SCOPE}>
          <h3>{SCOPE}</h3>
          <p className="m-0 flex flex-wrap gap-1.5">
            {trace.scope.tags.map((t) => (
              <span key={t} className="tag" data-tone="accent">
                {t}
              </span>
            ))}
          </p>
          <p className="m-0 text-[12.5px] text-ink-700">{trace.scope.basis}</p>
        </GlassPanel>

        <GlassPanel className="trace-panel" aria-label={RULEPACK}>
          <h3>{RULEPACK}</h3>
          <dl className="fields">
            <dt>Version</dt>
            <dd className="mono">{trace.rulepack.version}</dd>
            <dt>Class</dt>
            <dd>
              <span className="tag" data-tone={CLASS_TONE[trace.rulepack.class]}>
                {trace.rulepack.class}
              </span>
            </dd>
            {trace.rulepack.rule_id ? (
              <>
                <dt>Rule</dt>
                <dd className="mono">{trace.rulepack.rule_id}</dd>
              </>
            ) : null}
            {trace.rulepack.matched_phrase ? (
              <>
                <dt>Matched phrase</dt>
                <dd>
                  <span className="verbatim">{trace.rulepack.matched_phrase}</span>
                </dd>
              </>
            ) : null}
            <dt>Decided at</dt>
            <dd className="mono">{trace.rulepack.decided_at}</dd>
          </dl>
        </GlassPanel>

        <GlassPanel className="trace-panel" aria-label={RETRIEVED}>
          <div className="blockhead">
            <h3>{RETRIEVED}</h3>
            <span className="mono text-[12px] text-ink-500">{trace.retrieved_chunk_ids.length}</span>
          </div>
          {trace.retrieved_chunk_ids.length > 0 ? (
            <ol className="idlist">
              {trace.retrieved_chunk_ids.map((id) => (
                <li key={id}>
                  <span className="id" title={id}>
                    {id}
                  </span>
                  <CopyId value={id} label="chunk id" />
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">{NONE_RETRIEVED}</p>
          )}
        </GlassPanel>

        <GlassPanel className="trace-panel" aria-label={PROMPTS}>
          <h3>{PROMPTS}</h3>
          <table className="reg">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Version</th>
                <th scope="col">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {trace.prompts.map((p) => (
                <tr key={`${p.role}:${p.version}`}>
                  <td className="mono">{p.role}</td>
                  <td className="mono">{p.version}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="mono" title={p.sha256}>
                        {p.sha256.slice(0, HASH_PREFIX)}
                      </span>
                      <CopyId value={p.sha256} label={`${p.role} prompt hash`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>


        <GlassPanel className="trace-panel" aria-label={GATES_TITLE}>
          <h3>{GATES_TITLE}</h3>
          <VerdictStrip results={trace.gate_results} repairRounds={trace.repair_rounds} />
          <dl className="fields">
            {GATES.map((g) => (
              <div key={g} className="contents">
                <dt className="mono">{g}</dt>
                <dd className={trace.gate_results[g].pass ? undefined : "text-defect"}>{trace.gate_results[g].detail}</dd>
              </div>
            ))}
          </dl>
        </GlassPanel>

        <GlassPanel className="trace-panel" aria-label={CONFIDENCE}>
          <h3>{CONFIDENCE}</h3>
          <div>
            <ConfidenceBand band={trace.confidence.band} inputs={trace.confidence.inputs} />
          </div>
          <dl className="fields">
            {inputs.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className="mono">{v}</dd>
              </div>
            ))}
          </dl>
        </GlassPanel>

        <GlassPanel className="trace-panel" data-span="2" aria-label={VERDICTS}>
          <div className="blockhead">
            <h3>{VERDICTS}</h3>
            <span className="mono text-[12px] text-ink-500">{trace.verifier_verdicts.length}</span>
          </div>
          {trace.verifier_verdicts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="reg verdict-table">
                <thead>
                  <tr>
                    <th scope="col">Sentence</th>
                    <th scope="col">Verdict</th>
                    <th scope="col">Span</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.verifier_verdicts.map((v) => (
                    <tr key={v.sentence_id}>
                      <td className="mono">{v.sentence_id}</td>
                      <td data-verdict={v.verdict} className="font-medium">
                        {v.verdict}
                      </td>
                      <td className="mono">{v.span_id ?? ""}</td>
                      <td>{v.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">{NONE_VERDICT}</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
