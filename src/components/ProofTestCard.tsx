// Blueprint 6.4 ProofTestCard: per test class, the latest record with its date and result text, the earlier records
// as the history list, the as-found and as-left values where a record carries them, and the fixed statement that
// no supplied document types an interval. Typed by ProofTest (9.4); the records are ordered by completion date,
// newest first, and nothing else is computed.
import Link from "next/link";
import type { ProofTest } from "@/contracts/generated/operations";
import { NO_INTERVAL_STATEMENT } from "@/lib/fixed-strings";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import "./system.css";

export type ProofTestCardProps = {
  testClass: ProofTest["test_class"];
  records: ProofTest[];
  /** Builds a work-order href; omitted, the ids print without links. */
  hrefFor?: (wo: string) => string;
  className?: string;
};

export const TEST_CLASS_LABEL: Record<ProofTest["test_class"], string> = {
  sis_proof_test: "SIS proof test",
  sil_logic_test: "SIL logic test",
  calibration_proof_test: "Calibration proof test",
  statutory_relief_test: "Statutory relief test",
};
const LATEST = "Latest record";
const EARLIER = "Earlier records";
const DATE = "Completed";
const RESULT = "Result";
const DEVICE = "Device";
const LOGIC_NO = "LOGIC No";
const WORK_ORDER = "Work order";
const AS_FOUND = "As found";
const AS_LEFT = "As left";
const RECORDS = "records";
const NONE = "No record of this test class.";

function Wo({ wo, hrefFor }: { wo: string; hrefFor?: (wo: string) => string }) {
  const href = hrefFor?.(wo);
  return href ? (
    <Link href={href} className="mono draw">
      {wo}
    </Link>
  ) : (
    <span className="mono">{wo}</span>
  );
}

export function ProofTestCard({ testClass, records, hrefFor, className }: ProofTestCardProps) {
  const ordered = [...records].sort((a, b) => b.completion_date.localeCompare(a.completion_date));
  const [latest, ...earlier] = ordered;
  return (
    <GlassPanel as="article" className={cx("ptest", className)} data-component="proof-test-card" data-test-class={testClass} aria-label={TEST_CLASS_LABEL[testClass]}>
      <div className="blockhead">
        <h3>{TEST_CLASS_LABEL[testClass]}</h3>
        <span className="mono text-[12px] text-ink-500">
          {ordered.length} {RECORDS}
        </span>
      </div>
      {latest ? (
        <>
          <div>
            <p className="eyebrow mb-1">{LATEST}</p>
            <dl className="ptest-latest">
              <dt>{DATE}</dt>
              <dd className="mono">{latest.completion_date}</dd>
              <dt>{RESULT}</dt>
              <dd>
                <span className="verbatim">{latest.result_text}</span>
              </dd>
              {latest.device_tag ? (
                <>
                  <dt>{DEVICE}</dt>
                  <dd className="mono">{latest.device_tag}</dd>
                </>
              ) : null}
              {latest.seq_id ? (
                <>
                  <dt>{LOGIC_NO}</dt>
                  <dd className="mono">{latest.seq_id}</dd>
                </>
              ) : null}
              <dt>{WORK_ORDER}</dt>
              <dd>
                <Wo wo={latest.wo_number} hrefFor={hrefFor} />
              </dd>
              {latest.as_found ? (
                <>
                  <dt>{AS_FOUND}</dt>
                  <dd className="mono">{latest.as_found}</dd>
                </>
              ) : null}
              {latest.as_left ? (
                <>
                  <dt>{AS_LEFT}</dt>
                  <dd className="mono">{latest.as_left}</dd>
                </>
              ) : null}
            </dl>
          </div>
          {earlier.length > 0 ? (
            <div>
              <p className="eyebrow mb-1">{EARLIER}</p>
              <ol className="ptest-history">
                {earlier.map((r) => (
                  <li key={`${r.wo_number}:${r.completion_date}`}>
                    <span className="mono">{r.completion_date}</span>
                    <Wo wo={r.wo_number} hrefFor={hrefFor} />
                    <span>
                      <span className="verbatim">{r.result_text}</span>
                      {r.as_found || r.as_left ? (
                        <span className="mono text-ink-500">
                          {r.as_found ? ` ${AS_FOUND.toLowerCase()} ${r.as_found}` : null}
                          {r.as_left ? ` ${AS_LEFT.toLowerCase()} ${r.as_left}` : null}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      ) : (
        <p className="ptest-none">{NONE}</p>
      )}
      <p className="ptest-interval">{NO_INTERVAL_STATEMENT}</p>
    </GlassPanel>
  );
}
