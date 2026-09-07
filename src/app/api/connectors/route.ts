// GET /api/connectors (blueprint 9.9, 9.14, 6.4 ConnectorPanel; AC-CTX-04): under the ask_read column through
// withRoute, the descriptor of each of the three contracts as the file states it, plus the provenance of the bytes
// the schema route serves and the digital twin row whose deep link is empty.
//
// Every value is read from bundle/contracts/*.schema.json by src/app/api/connectors/contracts.ts. A contract this
// runtime cannot read is named in `unreadable` and is absent from `connectors`; no descriptor is ever synthesised.
// The route reads three files and answers: it opens nothing, reaches no system, and no write path exists here or
// anywhere else in this product (INV-8).
import { NextResponse } from "next/server";
import { withRoute } from "@/auth/authorize";
import {
  connectorContracts,
  DIGITAL_TWIN_DEEP_LINK,
  DIGITAL_TWIN_DEFINITION,
  SCHEMA_MEDIA_TYPE,
  unreadableContracts,
} from "./contracts";

export const dynamic = "force-dynamic";

export const GET = withRoute("/api/connectors", "ask_read", async () =>
  NextResponse.json(
    {
      connectors: connectorContracts().map((c) => ({
        name: c.name,
        title: c.schema.title,
        description: c.schema.description,
        status: c.schema["x-status"],
        sync: c.schema["x-sync"],
        conflict_rule: c.schema["x-conflict-rule"],
        failure_behaviour: c.schema["x-failure-behaviour"],
        blueprint: c.schema["x-blueprint"],
        schema_id: c.schema.$id,
        schema_href: c.schemaHref,
        schema_media_type: SCHEMA_MEDIA_TYPE,
        file: c.file,
        sha256: c.sha256,
        byte_length: c.byteLength,
        definitions: Object.keys(c.schema.$defs),
      })),
      unreadable: unreadableContracts(),
      digital_twin: { definition: DIGITAL_TWIN_DEFINITION, deep_link: DIGITAL_TWIN_DEEP_LINK },
    },
    { headers: { "cache-control": "private, no-store" } },
  ),
);
