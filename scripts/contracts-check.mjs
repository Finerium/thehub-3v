#!/usr/bin/env node
// The contracts seam (blueprint 8.3 and 9, ARCHITECTURE 1.4): thehub-harness/contracts/*.schema.json is the one home
// of every JSON Schema; this script compiles every file with Ajv 2020-12 in strict mode and regenerates the Zod
// modules under src/contracts/generated (one module per schema file, one export per named type, an index.ts).
//
//   node scripts/contracts-check.mjs gen     compile, then regenerate src/contracts/generated
//   node scripts/contracts-check.mjs check   the same, then exit 1 when the regeneration changed a tracked file
//
// Exit status is non-zero on any schema compile error, any unresolvable $ref, or (check) any git diff.
// CONTRACTS_DIR overrides the default ../thehub-harness/contracts (CI checks the harness out at its pinned tag).
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { jsonSchemaToZod } from "json-schema-to-zod";

const mode = process.argv[2];
if (mode !== "gen" && mode !== "check") {
  console.error("usage: node scripts/contracts-check.mjs gen|check");
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.resolve(process.env.CONTRACTS_DIR ?? path.join(root, "..", "thehub-harness", "contracts"));
const outDir = path.join(root, "src", "contracts", "generated");

// The annotation keywords the contracts README declares as ignored by validators; any other unknown keyword is a
// strict-mode error, so a new annotation is first declared there and then here.
const ANNOTATION_KEYWORDS = [
  "x-blueprint",
  "x-expected",
  "x-status",
  "x-transitions",
  "x-counts-at-v1",
  "x-sync",
  "x-conflict-rule",
  "x-failure-behaviour",
  "x-untracked",
  "x-optional",
  "x-file-notes",
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .filter((f) => f.endsWith(".schema.json"));
}

const schemas = walk(contractsDir)
  .sort()
  .map((file) => ({ rel: path.relative(contractsDir, file), json: JSON.parse(readFileSync(file, "utf8")) }));
if (schemas.length === 0) {
  console.error(`no *.schema.json under ${contractsDir}`);
  process.exit(1);
}
let failures = 0;
const fail = (rel, message) => {
  failures += 1;
  console.error(`FAIL ${rel}: ${message}`);
};
for (const s of schemas) if (typeof s.json.$id !== "string") fail(s.rel, "missing $id");
if (failures > 0) process.exit(1);
const byId = new Map(schemas.map((s) => [s.json.$id, s.json]));

// 1. Ajv 2020-12, strict: every file validates against the meta-schema on addSchema; every named type compiles, so
//    every $ref resolves and every keyword is known.
// strictRequired stays off: the fixture registry (10.5) requires keys it shapes through propertyNames and
// additionalProperties (the rule ids under integrity.rules), which that one check rejects by design.
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
addFormats(ajv);
ajv.addVocabulary(ANNOTATION_KEYWORDS);
for (const s of schemas) {
  try {
    ajv.addSchema(s.json);
  } catch (e) {
    fail(s.rel, e.message);
  }
}
for (const s of schemas) {
  const keys = [s.json.$id, ...Object.keys(s.json.$defs ?? {}).map((name) => `${s.json.$id}#/$defs/${name}`)];
  for (const key of keys) {
    try {
      if (!ajv.getSchema(key)) fail(s.rel, `cannot compile ${key}`);
    } catch (e) {
      fail(s.rel, `${key}: ${e.message}`);
    }
  }
}
if (failures > 0) {
  console.error(`${failures} contract failure(s); nothing generated`);
  process.exit(1);
}
console.log(`ajv 2020-12 strict: ${schemas.length} schema files compile`);

// 2. Zod modules. json-schema-to-zod resolves no $ref (an unresolved one silently becomes z.any()), so every $ref is
//    resolved here by $id and JSON pointer: a reference to a sibling type already emitted in the same module becomes
//    that identifier, everything else is inlined.
function resolveRef(ref, baseId) {
  const url = new URL(ref, baseId);
  const docId = url.href.replace(/#.*$/, "");
  const doc = byId.get(docId);
  if (!doc) throw new Error(`unresolvable $ref "${ref}" from ${baseId}: no schema has $id ${docId}`);
  const pointer = decodeURIComponent(url.hash.slice(1));
  let node = doc;
  for (const seg of pointer.split("/").slice(1)) {
    node = node?.[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  if (node === undefined) throw new Error(`unresolvable $ref "${ref}" from ${baseId}: pointer ${pointer} not found`);
  return { node, baseId: docId };
}

function deref(node, baseId, moduleId, emitted, depth = 0) {
  if (depth > 64) throw new Error(`$ref chain deeper than 64 in ${baseId}`);
  if (Array.isArray(node)) return node.map((n) => deref(n, baseId, moduleId, emitted, depth + 1));
  if (node === null || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    const sibling = baseId === moduleId ? /^#\/\$defs\/([^/]+)$/.exec(node.$ref)?.[1] : undefined;
    if (sibling && emitted.has(sibling)) return { "x-zod-identifier": sibling };
    const target = resolveRef(node.$ref, baseId);
    return deref(target.node, target.baseId, moduleId, emitted, depth + 1);
  }
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, deref(v, baseId, moduleId, emitted, depth + 1)]),
  );
}

// Where json-schema-to-zod's default output loses the contract's shape: a sibling reference, an array const
// (z.literal would read it as a set of alternatives), a nullable string enum (kept as z.enum(...).nullable() so the
// Drizzle schema can pin the same values), and oneOf over strict objects (z.union instead of an untyped superRefine).
const parserOverride = (schema) => {
  if (typeof schema["x-zod-identifier"] === "string") return schema["x-zod-identifier"];
  if (Array.isArray(schema.const)) {
    return `z.tuple([${schema.const.map((v) => `z.literal(${JSON.stringify(v)})`).join(", ")}])`;
  }
  if (
    Array.isArray(schema.enum) &&
    schema.enum.includes(null) &&
    schema.enum.every((v) => v === null || typeof v === "string")
  ) {
    return `z.enum(${JSON.stringify(schema.enum.filter((v) => v !== null))}).nullable()`;
  }
  if (Array.isArray(schema.oneOf) && Object.keys(schema).every((k) => ["oneOf", "title", "description"].includes(k))) {
    return `z.union([${schema.oneOf.map((b) => jsonSchemaToZod(b, { parserOverride })).join(", ")}])`;
  }
  return undefined;
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const modules = [];
for (const s of schemas) {
  const name = path.basename(s.rel).replace(/\.schema\.json$/, "");
  if (modules.includes(name)) fail(s.rel, `module name ${name} collides with another schema file`);
  const emitted = new Set();
  const lines = [
    `// GENERATED by scripts/contracts-check.mjs from thehub-harness/contracts/${s.rel} (blueprint ${s.json["x-blueprint"]}).`,
    "// Do not edit; run `pnpm contracts:gen` after the contract changes and commit the result.",
    'import { z } from "zod";',
    "",
  ];
  const emit = (typeName, node) => {
    try {
      const expr = jsonSchemaToZod(deref(node, s.json.$id, s.json.$id, emitted), { parserOverride });
      lines.push(`export const ${typeName} = ${expr};`, `export type ${typeName} = z.infer<typeof ${typeName}>;`, "");
      emitted.add(typeName);
    } catch (e) {
      fail(s.rel, `${typeName}: ${e.message}`);
    }
  };
  for (const [typeName, def] of Object.entries(s.json.$defs ?? {})) emit(typeName, def);
  // A file whose root is itself the object (the fixture registry) exports that shape as Root; a root that only
  // points at one of its $defs is already covered by that export.
  if (s.json.properties || (s.json.type && !s.json.$ref)) {
    const { $schema, $id, $defs, ...rootShape } = s.json;
    void $schema;
    void $id;
    void $defs;
    emit("Root", rootShape);
  }
  writeFileSync(path.join(outDir, `${name}.ts`), `${lines.join("\n").trimEnd()}\n`);
  modules.push(name);
}
writeFileSync(
  path.join(outDir, "index.ts"),
  [
    "// GENERATED by scripts/contracts-check.mjs; one namespace per contract schema file. Do not edit.",
    ...modules.map((m) => `export * as ${m} from "./${m}";`),
    "",
  ].join("\n"),
);
if (failures > 0) {
  console.error(`${failures} generation failure(s)`);
  process.exit(1);
}
console.log(`generated ${modules.length} Zod modules into ${path.relative(root, outDir)}`);

if (mode === "check") {
  const diff = execFileSync("git", ["status", "--porcelain", "--", path.relative(root, outDir)], {
    cwd: root,
    encoding: "utf8",
  });
  if (diff.trim() !== "") {
    console.error(`src/contracts/generated is out of date with the contracts:\n${diff}`);
    process.exit(1);
  }
  console.log("src/contracts/generated matches the contracts");
}
