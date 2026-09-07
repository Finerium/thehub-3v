// The three connector contracts of blueprint 9.14, as this repository holds them: bundle/contracts/aims.schema.json,
// edms.schema.json and historian.schema.json, the byte-for-byte copies of thehub-harness/contracts/connectors/ that
// the bundle carries (9.1 bundle layout; src/gates/g1/bundle.ts compares the copies against the harness contract on
// every ingestion, so a drifted copy fails G1 before it can reach a surface).
//
// This module is the one reader. GET /api/connectors serves the descriptors it parses, GET /api/connectors/:name/schema
// serves the bytes it holds without touching them, and the ConnectorPanel of 6.4 renders both. Nothing here opens a
// socket, resolves a host, polls, subscribes or writes: a contract is a document on disk, and no write path toward any
// system exists anywhere in this product (blueprint 1 item 8, INV-8).
//
// Every field a surface shows is read from the file. Nothing about a connector is typed into a component, so a
// contract that changes changes the panel, and a contract this runtime cannot read renders a designed state rather
// than a plausible-looking row (blueprint 10.3, AC-VIS-04).
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DigitalTwinRow } from "@/contracts/generated/edms";
import { sha256Hex } from "@/lib/hash";

/** 9.14, in the order the panel lists them. */
export const CONNECTOR_NAMES = ["aims", "edms", "historian"] as const;
export type ConnectorName = (typeof CONNECTOR_NAMES)[number];

/** The registered media type of a JSON Schema document; what GET /api/connectors/:name/schema answers with. */
export const SCHEMA_MEDIA_TYPE = "application/schema+json";

/** 9.14 and AC-CTX-04: the digital twin row's deep link, read from the contract's own literal, never typed. */
export const DIGITAL_TWIN_DEEP_LINK: string = DigitalTwinRow.shape.deep_link.value;

/** The $def of edms.schema.json that carries that field. */
export const DIGITAL_TWIN_DEFINITION = "DigitalTwinRow";

// A static `new URL(<literal>, import.meta.url)` is an asset reference the bundler resolves and traces, so the
// deployed function carries the file; process.cwd() is the fallback for a runtime that resolves the module URL to
// its own chunk instead. Both are read at module load, once, like every other file this application reads.
const ASSET: Record<ConnectorName, URL> = {
  aims: new URL("../../../../bundle/contracts/aims.schema.json", import.meta.url),
  edms: new URL("../../../../bundle/contracts/edms.schema.json", import.meta.url),
  historian: new URL("../../../../bundle/contracts/historian.schema.json", import.meta.url),
};

/** The repository path each contract is read from, as the panel states it. */
export function contractFile(name: ConnectorName): string {
  return `bundle/contracts/${name}.schema.json`;
}

// One property of a record shape: what the panel prints in the field table. Loose, because the contract may carry
// keywords this panel does not render and must not reject for that.
const SchemaField = z.looseObject({
  type: z.string().optional(),
  format: z.string().optional(),
  description: z.string().optional(),
  const: z.string().optional(),
  default: z.string().optional(),
  items: z.looseObject({ type: z.string().optional() }).optional(),
});
export type SchemaField = z.infer<typeof SchemaField>;

// One $def: either an object with its own properties (EdmsDocumentRecord, HistorianReading, DigitalTwinRow) or a
// reference to a shape another contract file already fixes (AimsWorkOrderRow points at WorkOrder of 9.4).
const SchemaDefinition = z.looseObject({
  title: z.string(),
  description: z.string(),
  $ref: z.string().optional(),
  properties: z.record(z.string(), SchemaField).optional(),
  required: z.array(z.string()).optional(),
});
export type SchemaDefinition = z.infer<typeof SchemaDefinition>;

// The file itself. The dialect is asserted, so a file that is not a JSON Schema 2020-12 document cannot render as
// one; the five x- annotations are the ones the contracts README declares and contracts-check.mjs admits.
const ConnectorSchema = z.looseObject({
  $schema: z.literal("https://json-schema.org/draft/2020-12/schema"),
  $id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  "x-blueprint": z.string().min(1),
  "x-status": z.string().min(1),
  "x-sync": z.string().min(1),
  "x-conflict-rule": z.string().min(1),
  "x-failure-behaviour": z.string().min(1),
  $defs: z.record(z.string(), SchemaDefinition),
});
export type ConnectorSchema = z.infer<typeof ConnectorSchema>;

/** What a surface is given: the parsed contract and the provenance of the bytes behind it, never the bytes. */
export type ConnectorContract = {
  name: ConnectorName;
  /** The path this runtime read, relative to the repository root. */
  file: string;
  /** The route that answers with those bytes. */
  schemaHref: string;
  byteLength: number;
  sha256: string;
  schema: ConnectorSchema;
};

type Loaded = { bytes: Buffer; contract: ConnectorContract };

function load(name: ConnectorName): Loaded | null {
  const candidates: Array<URL | string> = [ASSET[name], path.resolve(process.cwd(), contractFile(name))];
  for (const at of candidates) {
    try {
      const bytes = readFileSync(at);
      const schema = ConnectorSchema.parse(JSON.parse(bytes.toString("utf8")));
      return {
        bytes,
        contract: {
          name,
          file: contractFile(name),
          schemaHref: `/api/connectors/${name}/schema`,
          byteLength: bytes.byteLength,
          sha256: sha256Hex(bytes),
          schema,
        },
      };
    } catch {
      continue;
    }
  }
  return null;
}

const LOADED: Record<ConnectorName, Loaded | null> = {
  aims: load("aims"),
  edms: load("edms"),
  historian: load("historian"),
};

/** The contracts this runtime could read and parse, in 9.14 order. */
export function connectorContracts(): ConnectorContract[] {
  return CONNECTOR_NAMES.map((name) => LOADED[name]?.contract).filter((c): c is ConnectorContract => c !== undefined);
}

/** The names this runtime could not read or could not parse; the panel names them instead of hiding them. */
export function unreadableContracts(): ConnectorName[] {
  return CONNECTOR_NAMES.filter((name) => LOADED[name] === null);
}

/** The file's own bytes, for the route that serves them unchanged. */
export function connectorBytes(name: ConnectorName): Buffer | null {
  return LOADED[name]?.bytes ?? null;
}
