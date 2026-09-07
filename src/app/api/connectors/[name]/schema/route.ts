// GET /api/connectors/:name/schema (blueprint 9.9, 9.14; AC-CTX-04): under the ask_read column through withRoute,
// the repository's own contract file byte for byte. The bytes leave exactly as bundle/contracts/<name>.schema.json
// holds them, as application/schema+json, so a reviewer can validate the served document as JSON Schema 2020-12 and
// compare its digest with the one the connector panel prints beside the link.
//
// 404 designed JSON for a name that is not one of the three; 503 when this runtime cannot read the file, which is
// the only other answer: nothing is generated, re-serialised or filled in.
import type { NextRequest } from "next/server";
import { withRoute } from "@/auth/authorize";
import { HttpError, NotFound } from "@/lib/errors";
import { CONNECTOR_NAMES, connectorBytes, contractFile, SCHEMA_MEDIA_TYPE, type ConnectorName } from "../../contracts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

function isConnectorName(value: string): value is ConnectorName {
  return (CONNECTOR_NAMES as readonly string[]).includes(value);
}

export const GET = withRoute(
  "/api/connectors/:name/schema",
  "ask_read",
  async (_request: NextRequest, context: Context) => {
    const { name } = await context.params;
    if (!isConnectorName(name)) throw new NotFound("connector_contract", name);
    const bytes = connectorBytes(name);
    if (bytes === null) {
      throw new HttpError(503, "contract_unreadable", { connector: name, file: contractFile(name) });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": SCHEMA_MEDIA_TYPE,
        "content-length": String(bytes.byteLength),
        "content-disposition": `inline; filename="${name}.schema.json"`,
        "cache-control": "private, no-store",
      },
    });
  },
);
