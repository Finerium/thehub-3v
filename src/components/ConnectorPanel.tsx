// Blueprint 6.4 ConnectorPanel: the three contracts of 9.14 with their status, the schema download, and the empty
// deep-link field of the digital twin row. AC-CTX-04.
//
// Every word and every figure below is read out of bundle/contracts/<name>.schema.json by
// src/app/api/connectors/contracts.ts: the title, the description, the four x- annotations, the record shapes and
// their fields, and the digest and byte count of the file the schema route serves. Nothing about a connector is
// typed here, so a contract that changes changes this panel, and a contract this runtime cannot read is named
// rather than replaced by a plausible row (blueprint 10.3, AC-VIS-04).
//
// The status wording is the fixed StatusBadge string of 6.3 and it is only rendered when the contract's own
// x-status annotation says the same thing; a contract that ever said something else would print its own words in
// the defect tone instead of being dressed as this one.
import type { ConnectorContract, ConnectorName, SchemaDefinition, SchemaField } from "@/app/api/connectors/contracts";
import { DIGITAL_TWIN_DEEP_LINK, DIGITAL_TWIN_DEFINITION } from "@/app/api/connectors/contracts";
import { STATUS_WORDING } from "@/lib/fixed-strings";
import { cx } from "./cx";
import { DesignedState } from "./DesignedState";
import { GlassPanel } from "./GlassPanel";
import { StatusBadge } from "./StatusBadge";
import "./system.css";

const HEADING = "Integration contracts";
const INTRO =
  "Three read-only contracts state what The Hub would exchange with the plant's systems of record. None of them is connected. This deployment holds no endpoint, no credential and no client for any of these systems, so every figure on every surface comes from the seeded corpus and never from a live system.";
const NO_WRITE_HEADING = "No write path";
const NO_WRITE =
  "No write path toward any system exists anywhere in this product. The three contracts describe reads only; there is no outbound route toward a control system, a safety instrumented system, a historian, a document store or a maintenance system; and nothing on any surface can change a setpoint, a permissive, a trip, a work order or a document in a system of record. A published lesson is written into this application's own database and nowhere else.";
const SYNC = "Sync";
const CONFLICT = "Conflict rule";
const FAILURE = "Failure behaviour";
const BLUEPRINT = "Blueprint section";
const SCHEMA_ID = "Schema id";
const SHAPES = "Record shapes";
const REF = "Shape fixed by";
const FIELD = "Field";
const TYPE = "Type";
const REQUIRED = "Required";
const CARRIES = "What it carries";
const YES = "yes";
const NO = "no";
const DOWNLOAD = "Download the schema";
const SERVED_AS = "served byte for byte as";
const BYTES = "bytes";
const TWIN_HEADING = "Digital twin";
const TWIN_WHY =
  "The row exists so the contract is complete, and its deep link stays empty because there is no digital twin to link to: no twin is connected, no twin identifier is held for any asset, and no address could be resolved. The contract fixes the field to the empty string and admits no other value, so the link cannot be supplied by filling the field in; it would take a connected twin, which is out of scope.";
const TWIN_FIELD = "deep_link";
const TWIN_EMPTY = "empty";
const TWIN_SHAPE = "Record shape";
const UNREADABLE_TITLE = "A contract file was not readable here";
const UNREADABLE_EXPLANATION =
  "The panel prints what the contract file states and nothing else, so a file this runtime could not read or could not parse is named here instead of being shown as a row. The file is in the repository under bundle/contracts and the schema route answers 503 for it.";
const NONE_TITLE = "No contract file was readable here";
const NONE_EXPLANATION =
  "This runtime read none of the three contract files, so the panel has nothing to state. The files are in the repository under bundle/contracts, copied there by the bundle the deployment is seeded from.";

/** The type as the contract writes it: the type, an array's item type, and the format where one is fixed. */
function typeOf(field: SchemaField): string {
  const item = field.items?.type;
  const base = item === undefined ? (field.type ?? "") : `${field.type ?? "array"} of ${item}`;
  return field.format === undefined ? base : `${base}, ${field.format}`;
}

function FieldTable({ definition }: { definition: SchemaDefinition }) {
  const properties = Object.entries(definition.properties ?? {});
  const required = new Set(definition.required ?? []);
  return (
    <div className="overflow-x-auto">
      <table className="reg">
        <caption className="sr-only">{`The fields of ${definition.title} as the contract fixes them`}</caption>
        <thead>
          <tr>
            <th scope="col">{FIELD}</th>
            <th scope="col">{TYPE}</th>
            <th scope="col">{REQUIRED}</th>
            <th scope="col">{CARRIES}</th>
          </tr>
        </thead>
        <tbody>
          {properties.map(([name, field]) => (
            <tr key={name}>
              <th scope="row" className="mono font-medium whitespace-nowrap text-ink-900">
                {name}
              </th>
              <td className="mono text-[12px] whitespace-nowrap">{typeOf(field)}</td>
              <td className="text-[12px]">{required.has(name) ? YES : NO}</td>
              <td className="text-[12.5px]">
                {field.description ?? null}
                {field.const === undefined ? null : (
                  <span className="mono ml-2 text-ink-500">{`const "${field.const}"`}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Contract({ contract }: { contract: ConnectorContract }) {
  const { schema } = contract;
  const headingId = `connector-${contract.name}`;
  return (
    <GlassPanel
      as="article"
      className="flex flex-col gap-4 p-5"
      data-component="connector-contract"
      data-connector={contract.name}
      aria-labelledby={headingId}
    >
      <div className="blockhead">
        <h3 id={headingId}>{schema.title}</h3>
        {schema["x-status"] === STATUS_WORDING.specified_not_connected ? (
          <StatusBadge kind="specified_not_connected" />
        ) : (
          <span className="badge" data-tone="defect">
            {schema["x-status"]}
          </span>
        )}
      </div>

      <p className="max-w-prose text-[13px] text-ink-700">{schema.description}</p>

      <dl className="fields">
        <div className="contents">
          <dt>{SYNC}</dt>
          <dd>{schema["x-sync"]}</dd>
        </div>
        <div className="contents">
          <dt>{CONFLICT}</dt>
          <dd>{schema["x-conflict-rule"]}</dd>
        </div>
        <div className="contents">
          <dt>{FAILURE}</dt>
          <dd>{schema["x-failure-behaviour"]}</dd>
        </div>
        <div className="contents">
          <dt>{BLUEPRINT}</dt>
          <dd className="mono">{schema["x-blueprint"]}</dd>
        </div>
        <div className="contents">
          <dt>{SCHEMA_ID}</dt>
          {/* The identifier without its scheme and host: a JSON Schema $id is a name, not a place, and the offline
              export may carry no absolute address but the live URL, which its own build refuses. */}
          <dd className="mono text-[12px]">{schema.$id.replace(/^https?:\/\//, "")}</dd>
        </div>
      </dl>

      <div>
        <p className="eyebrow mb-2">{SHAPES}</p>
        <ul className="flex flex-col gap-4 p-0">
          {Object.entries(schema.$defs).map(([name, definition]) => (
            <li key={name} className="list-none">
              <p className="mono text-[13px] font-medium text-ink-900">{name}</p>
              <p className="mt-1 max-w-prose text-[12.5px] text-ink-700">{definition.description}</p>
              {definition.properties === undefined ? (
                <p className="mt-2 text-[12.5px]">
                  <span className="eyebrow">{REF} </span>
                  <span className="mono text-ink-900">{definition.$ref ?? ""}</span>
                </p>
              ) : (
                <div className="mt-2">
                  <FieldTable definition={definition} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <a className="chip text-[12.5px]" href={contract.schemaHref} download={`${contract.name}.schema.json`}>
          {DOWNLOAD}
          <span aria-hidden className="mono">
            &darr;
          </span>
        </a>
        <span className="mono text-[11.5px] text-ink-500">
          {contract.file} {SERVED_AS} {contract.schemaHref}
        </span>
        <span className="mono text-[11.5px] text-ink-500">
          {contract.byteLength} {BYTES}
        </span>
        <span className="mono text-[11.5px] break-all text-ink-500">sha256 {contract.sha256}</span>
      </p>
    </GlassPanel>
  );
}

/**
 * The digital twin row of 9.14: one field, empty, with the reason it is empty stated beside it. The value is the
 * contract's own literal (z.literal("") of the generated EDMS module), so the field cannot be filled by editing a
 * component; the shape it belongs to is listed with the EDMS contract's other record shapes above.
 */
function DigitalTwin() {
  return (
    <GlassPanel className="flex flex-col gap-3 p-5" data-component="connector-digital-twin" aria-labelledby="connector-twin">
      <div className="blockhead">
        <h3 id="connector-twin">{TWIN_HEADING}</h3>
        <StatusBadge kind="specified_not_connected" />
      </div>
      <dl className="fields">
        <div className="contents">
          <dt className="mono">{TWIN_FIELD}</dt>
          <dd>
            <span className="mono text-ink-900">{`"${DIGITAL_TWIN_DEEP_LINK}"`}</span>{" "}
            <span className="text-ink-500">{TWIN_EMPTY}</span>
          </dd>
        </div>
        <div className="contents">
          <dt>{TWIN_SHAPE}</dt>
          <dd className="mono">{DIGITAL_TWIN_DEFINITION}</dd>
        </div>
      </dl>
      <p className="max-w-prose text-[12.5px] text-ink-700">{TWIN_WHY}</p>
    </GlassPanel>
  );
}

export type ConnectorPanelProps = {
  /** The contracts this runtime read, in 9.14 order. */
  contracts: readonly ConnectorContract[];
  /** The contracts it could not read; named on the panel rather than hidden. */
  unreadable?: readonly ConnectorName[];
  className?: string;
};

export function ConnectorPanel({ contracts, unreadable = [], className }: ConnectorPanelProps) {
  return (
    <section
      className={cx("flex flex-col gap-4", className)}
      data-component="connector-panel"
      aria-labelledby="connector-panel-heading"
    >
      <div className="blockhead">
        <h2 id="connector-panel-heading" className="text-[20px]">
          {HEADING}
        </h2>
        <span className="text-[12px] text-ink-500">{`${contracts.length} of ${contracts.length + unreadable.length} contract files read`}</span>
      </div>
      <p className="max-w-prose text-[13px] text-ink-700">{INTRO}</p>

      <GlassPanel className="p-5" data-component="connector-no-write" aria-labelledby="connector-no-write-heading">
        <div className="blockhead">
          <h3 id="connector-no-write-heading">{NO_WRITE_HEADING}</h3>
        </div>
        <p className="mt-2 max-w-prose text-[13px] text-ink-700">{NO_WRITE}</p>
      </GlassPanel>

      {unreadable.length > 0 ? (
        <DesignedState
          inline
          tone="caveat"
          code="503"
          title={UNREADABLE_TITLE}
          explanation={UNREADABLE_EXPLANATION}
          reason={unreadable.join(", ")}
        />
      ) : null}

      {contracts.length === 0 ? (
        <DesignedState inline tone="caveat" title={NONE_TITLE} explanation={NONE_EXPLANATION} />
      ) : (
        <>
          {contracts.map((contract) => (
            <Contract key={contract.name} contract={contract} />
          ))}
          <DigitalTwin />
        </>
      )}
    </section>
  );
}
