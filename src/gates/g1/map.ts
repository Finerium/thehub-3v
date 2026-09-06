// contracts/bundle_map.json of the harness, the one map from every file of the bundle (blueprint 9.1) to the
// contract that validates it, resolved here onto the generated Zod modules (ARCHITECTURE 1.4): `def` names a member
// of a contract's $defs (the item type of an array root, the type of an object root), `pointer` a block of a
// registry contract (fixtures.schema.json: "#" is the Root, "#/properties/<key>" a block below it), `properties`
// the typed keys of an object root that carries several 9.x types. The wrapper mirrors harness/validate.py.
import { z } from "zod";
import * as aims from "@/contracts/generated/aims";
import * as asset from "@/contracts/generated/asset";
import * as coverage from "@/contracts/generated/coverage";
import * as document from "@/contracts/generated/document";
import * as drafts from "@/contracts/generated/drafts";
import * as edms from "@/contracts/generated/edms";
import * as evidencePacket from "@/contracts/generated/evidence_packet";
import * as fixtures from "@/contracts/generated/fixtures";
import * as gateway from "@/contracts/generated/gateway";
import * as goldenCase from "@/contracts/generated/golden_case";
import * as historian from "@/contracts/generated/historian";
import * as manifest from "@/contracts/generated/manifest";
import * as operations from "@/contracts/generated/operations";
import * as rulepack from "@/contracts/generated/rulepack";
import * as serving from "@/contracts/generated/serving";
import * as teamFacts from "@/contracts/generated/team_facts";

const SubEntry = z.object({ root: z.enum(["object", "array"]), def: z.string().nullable() }).strict();

export const MapEntry = z.looseObject({
  format: z.enum(["json", "jsonl", "yaml", "markdown", "text", "binary", "json_schema"]),
  root: z.enum(["object", "array", "lines", "text"]),
  schema: z.string().nullable(),
  def: z.string().nullable().optional(),
  pointer: z.string().optional(),
  properties: z.record(z.string(), SubEntry).optional(),
  seed_time: z.boolean().optional(),
  optional: z.boolean().optional(),
  required_from: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
});
export type MapEntry = z.infer<typeof MapEntry>;

export const BundleMap = z.looseObject({
  contracts_dir: z.string(),
  files: z.record(z.string(), MapEntry),
  prefixes: z.record(z.string(), z.looseObject({ format: z.string(), seed_time: z.boolean().optional() })),
});
export type BundleMap = z.infer<typeof BundleMap>;

// One namespace per contract file, as the generated module headers name them (scripts/contracts-check.mjs).
const NAMESPACES: Record<string, Record<string, unknown>> = {
  "bundle/manifest.schema.json": manifest,
  "connectors/aims.schema.json": aims,
  "connectors/edms.schema.json": edms,
  "connectors/historian.schema.json": historian,
  "entities/asset.schema.json": asset,
  "entities/coverage.schema.json": coverage,
  "entities/document.schema.json": document,
  "entities/drafts.schema.json": drafts,
  "entities/operations.schema.json": operations,
  "entities/serving.schema.json": serving,
  "evidence_packet.schema.json": evidencePacket,
  "fixtures.schema.json": fixtures,
  "gateway.schema.json": gateway,
  "golden_case.schema.json": goldenCase,
  "rulepack.schema.json": rulepack,
  "team_facts.schema.json": teamFacts,
};

// The object-root type of a registry contract, the target of pointer "#" (fixtures.schema.json exports Root).
const ROOT_EXPORT = "Root";

function defOf(schemaFile: string, def: string): z.ZodType {
  const type = NAMESPACES[schemaFile]?.[def];
  if (!(type instanceof z.ZodType)) {
    throw new Error(`bundle_map.json names ${def} of ${schemaFile}, which no generated module exports`);
  }
  return type;
}

// "#" is the root type; "#/properties/<key>" (repeatable) walks the object shapes below it.
function pointerOf(schemaFile: string, pointer: string): z.ZodType {
  let type = defOf(schemaFile, ROOT_EXPORT);
  const parts = pointer.replace(/^#\/?/, "").split("/").filter((p) => p.length > 0);
  for (let i = 0; i < parts.length; i += 2) {
    const key = parts[i + 1];
    if (parts[i] !== "properties" || key === undefined || !(type instanceof z.ZodObject)) {
      throw new Error(`unsupported pointer ${pointer} into ${schemaFile}`);
    }
    const next = (type.shape as Record<string, unknown>)[key];
    if (!(next instanceof z.ZodType)) throw new Error(`pointer ${pointer} names no property of ${schemaFile}`);
    type = next;
  }
  return type;
}

function typeOf(schemaFile: string, ref: { def?: string | null; pointer?: string }): z.ZodType {
  if (ref.pointer !== undefined) return pointerOf(schemaFile, ref.pointer);
  if (typeof ref.def === "string") return defOf(schemaFile, ref.def);
  throw new Error(`bundle_map.json entry for ${schemaFile} names neither a def nor a pointer`);
}

/**
 * The Zod type that validates one bundle file's parsed content (harness/validate.py wrapper): the item type for a
 * jsonl file, an array of the def for an array root, a strict object of the typed keys for a multi-type root; null
 * when the map carries no schema (the file is checked for its JSON root only).
 */
export function schemaFor(entry: MapEntry): z.ZodType | null {
  if (entry.schema === null) return null;
  if (entry.properties) {
    const shape: Record<string, z.ZodType> = {};
    for (const [key, sub] of Object.entries(entry.properties)) {
      shape[key] =
        sub.def === null
          ? z.array(z.unknown())
          : sub.root === "array"
            ? z.array(defOf(entry.schema, sub.def))
            : defOf(entry.schema, sub.def);
    }
    return z.object(shape).strict();
  }
  const type = typeOf(entry.schema, entry);
  return entry.root === "array" ? z.array(type) : type;
}
