// The connector sheet (blueprint 6.2 surface 5's connector panel and 6.4 ConnectorPanel, 9.9, 9.14; AC-CTX-04).
// The integration component of the case is answered as an honest partial: the three contracts are written, frozen
// and served, and not one of them is connected. This sheet is where the contracts themselves are read; the same
// panel renders on the asset page beside the asset's own values.
//
// Permission: the connector routes of 9.9 sit under the ask_read column, which every role holds, so this sheet
// turns no role away. It lives under /admin because that is where the deployment's own configuration is inspected,
// not because it is a second Admin right: nothing here can be changed from a surface, and nothing here writes.
// The way in is the connector panel on the asset page, which links here from every role; the way out is Admin for
// the role that holds activate_version and the fleet register for the three that do not, so neither end is a 403.
//
// Nothing on the sheet is typed. Every contract field, every record shape, every digest and every byte count comes
// from bundle/contracts/<name>.schema.json through src/app/api/connectors/contracts.ts, and the bytes behind the
// digests leave through GET /api/connectors/:name/schema unchanged.
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { connectorContracts, SCHEMA_MEDIA_TYPE, unreadableContracts } from "@/app/api/connectors/contracts";
import { can } from "@/auth/matrix";
import { requireSession } from "@/auth/session";
import { ConnectorPanel } from "@/components/ConnectorPanel";
import { GlassPanel } from "@/components/GlassPanel";
import "@/components/system.css";

export const metadata: Metadata = { title: "Connectors" };

// The session is read on every request; the contract files are read once, at module load.
export const dynamic = "force-dynamic";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

const TITLE = "Connectors";
const LEAD =
  "The integration component of the case is answered here as an honest partial. What an integration would exchange is written down as a frozen contract, one file per system, and every one of them reads specified, not connected. Nothing is stubbed, mocked or simulated behind them: there is no client, no endpoint and no credential for any of these systems in this deployment.";
const CHECK_HEADING = "How to check this sheet";
const CHECK_ROUTE = "Every contract below is served by its own route, and the bytes are the repository's file unchanged:";
const CHECK_MEDIA = "The response carries the JSON Schema media type";
const CHECK_DIGEST =
  "so a reviewer can save it, validate it as a JSON Schema 2020-12 document with any validator, and compare its SHA-256 with the digest printed beside the link on this sheet.";
const CHECK_GATE =
  "The three files are the bundle's copies of the harness contracts. The ingestion gate compares each copy with the harness contract byte for byte and refuses the bundle when they differ, and the contracts check compiles every schema file of the harness with Ajv in 2020-12 strict mode, so the file this route serves is the file both repositories are built against.";
const CHECK_REF =
  "One pointer does not resolve from these bytes alone: the AIMS record shape is a $ref to an entity contract of the harness repository, which the bundle does not carry and no route here serves. Each served file validates as a JSON Schema 2020-12 document on its own, and that reference is the one thing a validator will report it cannot fetch.";
const BACK = "Back to Admin";
// The sheet turns no role away, so the way out must not either: Admin is a designed 403 for the other three.
const BACK_FLEET = "Back to the fleet register";

export default async function ConnectorsPage() {
  const user = await requireSession();
  const toAdmin = can(user.role, "activate_version");
  const contracts = connectorContracts();
  const unreadable = unreadableContracts();

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">{TITLE}</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">{LEAD}</p>
        </div>
        <Link href={toAdmin ? "/admin" : "/assets"} className="draw text-[12.5px]">
          {toAdmin ? BACK : BACK_FLEET}
        </Link>
      </header>

      <div className="rise" style={stagger(1)}>
        <ConnectorPanel contracts={contracts} unreadable={unreadable} onSheet />
      </div>

      <div className="rise" style={stagger(2)}>
        <GlassPanel className="p-5" aria-labelledby="connector-check-heading">
          <div className="blockhead">
            <h2 id="connector-check-heading" className="text-[18px]">
              {CHECK_HEADING}
            </h2>
          </div>
          <p className="mt-2 max-w-prose text-[13px] text-ink-700">
            {CHECK_ROUTE} <span className="mono text-ink-900">GET /api/connectors/:name/schema</span>. {CHECK_MEDIA}{" "}
            <span className="mono text-ink-900">{SCHEMA_MEDIA_TYPE}</span>, {CHECK_DIGEST}
          </p>
          <p className="mt-3 max-w-prose text-[13px] text-ink-700">{CHECK_REF}</p>
          <p className="mt-3 max-w-prose text-[13px] text-ink-700">{CHECK_GATE}</p>
          <p className="mt-3 max-w-prose text-[12.5px] text-ink-500">
            The descriptors this sheet renders are the same ones{" "}
            <span className="mono text-ink-900">GET /api/connectors</span> answers with.
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
