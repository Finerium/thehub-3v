#!/usr/bin/env tsx
// docs/api.md, generated from the code that serves the API (AC-NFR-25, blueprint 9.9): the route files under
// src/app/api, the permission matrix of 9.9 in src/auth/matrix.ts, the typed error states of src/lib/errors.ts and
// the Zod contracts in src/contracts/generated. No sentence of the reference states a fact this script did not read
// out of the code, so a route that changes and a reference that does not is a red check rather than a stale page.
//
//   pnpm docs:api            regenerate docs/api.md
//   pnpm docs:api --check    regenerate in memory and exit 1 when docs/api.md differs from what the code says
//
// How each fact is read:
//
//   the path        from the file path under src/app/api, which is what Next.js routes ([id] becomes :id). The
//                   literal the file passes to withRoute() is compared against it and a disagreement is a failure.
//   the methods     the exported GET/POST/PUT/PATCH/DELETE bindings of the route file.
//   the guard       the permission argument of withRoute(), plus every can(role, "...") and authorize("...") the
//                   file performs itself. /api/drafts/:id/publish and /api/admin/corpus/activate pass null to
//                   withRoute and ask the matrix inside the handler, so reading the argument alone would print
//                   "public" for the two most guarded routes in the product.
//   the roles       computed from MATRIX: the roles whose column holds the permission. Nothing is typed here.
//   the shapes      the Zod declarations of the route file, classified by what they are parsed against
//                   (context.params, the search parameters, or the request body), and the schemas its responses
//                   are parsed through. A schema the file imports is named with the module it comes from.
//   the responses   every NextResponse.json / new Response in the handler with the status literal beside it, plus
//                   every typed error the handler throws, whose status and code are read from src/lib/errors.ts.
//   the contracts   src/contracts/generated/*.ts, each with the JSON Schema of thehub-harness/contracts it was
//                   generated from and the schemas it exports.
//
// ponytail: the reader is a syntax walk, not the type checker. It holds because every route file follows one
// shape (withRoute at the top level, Params/Query/Body declared beside it); a route written another way shows up
// as a route with no shapes rather than a wrong one, and the path comparison stays the backstop.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { MATRIX, PERMISSIONS, type Permission } from "@/auth/matrix";
import type { Role } from "@/contracts/generated/serving";

const ROOT = path.resolve(import.meta.dirname, "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const CONTRACTS_DIR = path.join(ROOT, "src", "contracts", "generated");
const ERRORS_FILE = path.join(ROOT, "src", "lib", "errors.ts");
const OUT_FILE = path.join(ROOT, "docs", "api.md");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const ROLES = Object.keys(MATRIX) as readonly Role[];
// src/auth/authorize.ts: AuthError names its status, and withRoute renders it on every guarded route.
const AUTH_CODES: Readonly<Record<number, string>> = { 401: "unauthenticated", 403: "forbidden" };

type Shape = {
  readonly kind: "path" | "query" | "body" | "response";
  readonly name: string;
  readonly source: string;
  readonly at: number;
};
type Answer = { readonly status: number; readonly what: string };
type Method = {
  readonly method: string;
  readonly permission: string | null;
  readonly enforced: readonly string[];
  readonly answers: readonly Answer[];
  readonly shapes: readonly Shape[];
};
type Route = {
  readonly url: string;
  readonly file: string;
  readonly description: readonly string[];
  readonly methods: readonly Method[];
  readonly headers: readonly string[];
};
type Contract = { readonly module: string; readonly schema: string; readonly exports: readonly string[] };

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function flat(node: ts.Node, source: ts.SourceFile, max = 110): string {
  const text = node.getText(source).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function literal(node: ts.Node | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
}

function number(node: ts.Node | undefined): number | null {
  return node !== undefined && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

function isCallTo(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
}

// A method call on a named object: NextResponse.json(...), Body.safeParse(...).
function methodCall(node: ts.Node): { object: string; method: string; call: ts.CallExpression } | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const target = node.expression.expression;
  if (!ts.isIdentifier(target)) return null;
  return { object: target.text, method: node.expression.name.text, call: node };
}

function statusOf(options: ts.Node | undefined): number {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return 200;
  for (const property of options.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === "status") {
      return number(property.initializer) ?? 200;
    }
  }
  return 200;
}

// The typed errors of src/lib/errors.ts as { class -> status, code }, read from the super() call of each class.
function errorTable(): ReadonlyMap<string, Answer> {
  const source = parse(ERRORS_FILE);
  const table = new Map<string, Answer>();
  walk(source, (node) => {
    if (!ts.isClassDeclaration(node) || node.name === undefined) return;
    walk(node, (inner) => {
      if (!ts.isCallExpression(inner) || inner.expression.kind !== ts.SyntaxKind.SuperKeyword) return;
      const status = number(inner.arguments[0]);
      const code = literal(inner.arguments[1]);
      if (status !== null && code !== null && node.name !== undefined) table.set(node.name.text, { status, what: code });
    });
  });
  return table;
}

function importsOf(source: ts.SourceFile): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (clause === undefined) continue;
    const from = statement.moduleSpecifier.text;
    if (clause.name) found.set(clause.name.text, from);
    const bindings = clause.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) found.set(element.name.text, from);
    }
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) found.set(bindings.name.text, from);
  }
  return found;
}

// The header comment every route file opens with, which is the module documentation AC-NFR-25 asks for.
function headerComment(file: string): readonly string[] {
  const lines: string[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("//")) break;
    lines.push(line.replace(/^\/\/ ?/, "").trimEnd());
  }
  return lines;
}

function routeFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(full);
      return entry.name === "route.ts" ? [full] : [];
    })
    .sort();
}

function urlOf(file: string): string {
  const relative = path.relative(path.join(ROOT, "src", "app"), path.dirname(file));
  return `/${relative.split(path.sep).map((part) => part.replace(/^\[(?:\.\.\.)?(.+)\]$/, ":$1")).join("/")}`;
}

function readRoute(file: string, errors: ReadonlyMap<string, Answer>): Route {
  const source = parse(file);
  const url = urlOf(file);
  const imports = importsOf(source);

  // Every withRoute() call of the file with its permission argument and its handler.
  const registrations: { node: ts.CallExpression; permission: string | null; handler: ts.Node | undefined }[] = [];
  const zod = new Map<string, string>();
  const shapes = new Map<string, Shape>();
  const headers = new Set<string>();
  const enforced = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (initializer === undefined || !ts.isIdentifier(declaration.name)) continue;
      // `const Body = z.object({...})` and the chained form `const Body = z\n  .object({...})\n  .strict()`.
      if (/^z\s*\./.test(initializer.getText(source))) zod.set(declaration.name.text, `const ${declaration.getText(source)}`);
    }
  }

  walk(source, (node) => {
    if (isCallTo(node, "withRoute")) {
      const argument = node.arguments[1];
      registrations.push({
        node,
        permission: argument !== undefined && argument.kind === ts.SyntaxKind.NullKeyword ? null : literal(argument),
        handler: node.arguments[2],
      });
      const stated = literal(node.arguments[0]);
      if (stated !== null && stated !== url) {
        throw new Error(`${path.relative(ROOT, file)}: withRoute registers ${stated}, the file serves ${url}`);
      }
    }
    if (isCallTo(node, "can") || isCallTo(node, "authorize")) {
      for (const argument of node.arguments) {
        const name = literal(argument);
        if (name !== null && (PERMISSIONS as readonly string[]).includes(name)) enforced.add(name);
      }
    }
    // request.headers.get("authorization"): the object is a property access, not a plain identifier.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "get") {
      const name = literal(node.arguments[0]);
      if (name !== null && node.expression.expression.getText(source).endsWith("headers")) headers.add(name);
    }
    const call = methodCall(node);
    if (call === null) return;
    if (call.method !== "parse" && call.method !== "safeParse") return;
    const against = call.call.arguments[0]?.getText(source) ?? "";
    // What the schema is parsed against says what it is; a route that parses an already-read value (the login
    // body arrives as JSON or as a form) is classified by the name the house style gives it.
    const byName: Readonly<Record<string, Shape["kind"]>> = { Params: "path", Query: "query", Body: "body", Credentials: "body" };
    const kind: Shape["kind"] = against.includes("context.params")
      ? "path"
      : against.includes("searchParams")
        ? "query"
        : against.includes("request.json")
          ? "body"
          : (byName[call.object] ?? "response");
    const local = zod.get(call.object);
    shapes.set(`${kind}:${call.object}`, {
      kind,
      name: call.object,
      source: local ?? `imported from \`${imports.get(call.object) ?? "the same module"}\``,
      at: node.getStart(source),
    });
  });

  const methods: Method[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const method = declaration.name.text;
      if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
      // The registration inside this export, or, when the export dispatches between registrations
      // (/api/admin/corpus/activate), every registration of the file.
      const inside = registrations.filter((r) => r.node.getStart(source) >= declaration.getStart(source) && r.node.end <= declaration.end);
      const mine = inside.length > 0 ? inside : registrations;
      const permission = mine.map((r) => r.permission).find((p) => p !== null) ?? null;
      const handler = inside.length === 1 ? inside[0]?.handler : undefined;
      const scope = handler ?? source;
      // A method whose handler could not be isolated (an export that dispatches between two registrations, as
      // /api/admin/corpus/activate does) is documented with everything the file parses and answers; a method
      // whose handler is known is documented with what that handler alone parses and answers, so the GET of a
      // file whose POST takes a body is not given the body.
      const own = [...shapes.values()].filter((shape) => shape.at >= scope.getStart(source) && shape.at <= scope.end);
      methods.push({
        method,
        permission,
        enforced: [...enforced].filter((name) => name !== permission).sort(),
        answers: answersOf(scope, source, errors),
        shapes: (handler !== undefined ? own : [...shapes.values()]).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
      });
    }
  }

  return {
    url,
    file: path.relative(ROOT, file),
    description: headerComment(file),
    methods: methods.sort((a, b) => a.method.localeCompare(b.method)),
    headers: [...headers].sort(),
  };
}

// Every answer the handler can produce: the responses it builds and the typed errors it throws.
function answersOf(scope: ts.Node, source: ts.SourceFile, errors: ReadonlyMap<string, Answer>): readonly Answer[] {
  const found = new Map<string, Answer>();
  const add = (answer: Answer): void => {
    found.set(`${answer.status} ${answer.what}`, answer);
  };
  walk(scope, (node) => {
    const call = methodCall(node);
    if (call !== null && call.object === "NextResponse" && (call.method === "json" || call.method === "redirect")) {
      const body = call.call.arguments[0];
      const status = call.method === "redirect" ? (number(call.call.arguments[1]) ?? 307) : statusOf(call.call.arguments[1]);
      add({ status, what: body === undefined ? "no body" : `${call.method === "redirect" ? "redirect to " : ""}${flat(body, source)}` });
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const constructed = node.expression.text;
      const args = node.arguments ?? ts.factory.createNodeArray<ts.Expression>();
      if (constructed === "NextResponse" || constructed === "Response") {
        add({ status: statusOf(args[1]), what: args[0] === undefined ? "no body" : flat(args[0], source) });
      } else if (constructed === "HttpError") {
        const status = number(args[0]);
        const code = literal(args[1]);
        if (status !== null && code !== null) add({ status, what: code });
      } else if (constructed === "AuthError") {
        const status = number(args[0]);
        if (status !== null) add({ status, what: AUTH_CODES[status] ?? "auth" });
      } else {
        const known = errors.get(constructed);
        if (known !== undefined) {
          const qualifier = args.map((argument) => literal(argument)).find((value) => value !== null);
          add({ status: known.status, what: qualifier === undefined || qualifier === null ? known.what : `${known.what} (${qualifier})` });
        }
      }
    }
    // A response built by a helper: /api/ask streams through ndjsonResponse().
    if (ts.isReturnStatement(node) && node.expression !== undefined && isCallTo(node.expression, "ndjsonResponse")) {
      add({ status: 200, what: "streamed by ndjsonResponse() (src/answer/stream.ts)" });
    }
  });
  return [...found.values()].sort((a, b) => a.status - b.status || a.what.localeCompare(b.what));
}

function readContracts(): readonly Contract[] {
  return readdirSync(CONTRACTS_DIR)
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .sort()
    .map((name) => {
      const text = readFileSync(path.join(CONTRACTS_DIR, name), "utf8");
      const from = /from ([^\s]+\.schema\.json)/.exec(text);
      return {
        module: name,
        schema: from?.[1] ?? "unknown",
        exports: [...text.matchAll(/^export const (\w+) = /gm)].map((match) => match[1] ?? "").filter((value) => value !== ""),
      };
    });
}

function rolesHolding(permission: string): readonly Role[] {
  return ROLES.filter((role) => MATRIX[role][permission as Permission] === true);
}

function guardOf(method: Method): string {
  const held = [method.permission, ...method.enforced].filter((value): value is string => value !== null);
  if (held.length === 0) return "public: no session is read";
  return held
    .map((permission) => `\`${permission}\`: ${rolesHolding(permission).join(", ")}`)
    .join("; then ");
}

function anchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
}

function render(routes: readonly Route[], contracts: readonly Contract[]): string {
  const out: string[] = [];
  const methods = routes.flatMap((route) => route.methods.map((method) => ({ route, method })));
  out.push("# API reference");
  out.push("");
  out.push(
    "GENERATED by `scripts/api-reference.ts` from the route files under `src/app/api`, the permission matrix of",
    "blueprint 9.9 in `src/auth/matrix.ts`, the typed error states in `src/lib/errors.ts` and the Zod contracts in",
    "`src/contracts/generated`. Do not edit this file: run `pnpm docs:api` after the code changes, and",
    "`pnpm docs:api --check` regenerates it in memory and fails when what is written here is no longer what the",
    "code does.",
    "",
    `${methods.length} handlers over ${routes.length} routes, and ${contracts.length} contract modules.`,
    "",
    "## The envelope every route shares",
    "",
    "`withRoute()` in `src/auth/authorize.ts` wraps every handler below. It answers `x-request-id` on every",
    "response, asks the matrix before the handler runs, and turns a typed error into its designed JSON state:",
    "",
    "| Status | Body | When |",
    "| --- | --- | --- |",
    "| 401 | `{ error: \"unauthenticated\", request_id }` | a guarded route with no session |",
    "| 403 | `{ error: \"forbidden\", request_id }` | a role whose matrix column is false; `auth.role_violation` is written first |",
    "| 500 | `{ error: \"internal\", request_id }` | an unexpected failure; never a stack trace, never a partial write |",
    "",
    "A status table below lists what the handler itself builds and throws. A typed error raised inside a module the",
    "handler calls (a gate, a query, the versions table) is rendered by the same envelope, so a route can also",
    "answer with a status its own table does not carry; `src/lib/errors.ts` holds every one of them.",
    "",
    "A body shape below is the expression the handler answers with, copied from the code, not a hand-written model.",
    "Request bodies are JSON. A schema the route declares is printed as it is declared; a schema it imports is named",
    "with the module it comes from.",
    "",
    "## Permissions and the roles that hold them",
    "",
    "Read from `MATRIX` in `src/auth/matrix.ts`, which is blueprint 9.9 as data.",
    "",
  );
  out.push(`| Permission | ${ROLES.join(" | ")} |`);
  out.push(`| --- | ${ROLES.map(() => "---").join(" | ")} |`);
  for (const permission of PERMISSIONS) {
    out.push(`| \`${permission}\` | ${ROLES.map((role) => (MATRIX[role][permission] ? "yes" : "no")).join(" | ")} |`);
  }
  out.push("", "## Routes", "", "| Method and path | Guard | Source |", "| --- | --- | --- |");
  for (const { route, method } of methods) {
    const heading = `${method.method} ${route.url}`;
    out.push(`| [${heading}](#${anchor(heading)}) | ${guardOf(method)} | \`${route.file}\` |`);
  }
  out.push("");

  for (const route of routes) {
    for (const method of route.methods) {
      out.push(`### ${method.method} ${route.url}`, "");
      out.push(`Source: \`${route.file}\`. Guard: ${guardOf(method)}.`, "");
      if (route.description.length > 0) {
        out.push("> " + route.description.join("\n> "), "");
      }
      if (route.headers.length > 0) {
        out.push(`Request headers read: ${route.headers.map((name) => `\`${name}\``).join(", ")}.`, "");
      }
      for (const shape of method.shapes) {
        const label =
          shape.kind === "path"
            ? "Path parameters"
            : shape.kind === "query"
              ? "Query parameters"
              : shape.kind === "body"
                ? "Request body"
                : "Response schema";
        if (shape.source.startsWith("imported")) {
          out.push(`${label}: \`${shape.name}\`, ${shape.source}.`, "");
        } else {
          out.push(`${label}, \`${shape.name}\`:`, "", "```ts", shape.source, "```", "");
        }
      }
      out.push("| Status | Answer |", "| --- | --- |");
      for (const answer of method.answers) out.push(`| ${answer.status} | \`${answer.what}\` |`);
      out.push("");
    }
  }

  out.push("## Contract modules", "");
  out.push(
    "One module per JSON Schema file of `thehub-harness/contracts`, regenerated by `pnpm contracts:gen` and checked",
    "by `pnpm contracts:check`. The schemas are the frozen section 9 of the blueprint; these modules are how the",
    "application reads them.",
    "",
    "| Module | Generated from | Exports |",
    "| --- | --- | --- |",
  );
  for (const contract of contracts) {
    out.push(`| \`src/contracts/generated/${contract.module}\` | \`${contract.schema}\` | ${contract.exports.map((name) => `\`${name}\``).join(", ")} |`);
  }
  out.push("");
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

const check = process.argv.includes("--check");
const errors = errorTable();
const routes = routeFiles(API_DIR).map((file) => readRoute(file, errors));
const contracts = readContracts();
const markdown = render(routes, contracts);
const handlers = routes.reduce((total, route) => total + route.methods.length, 0);

if (!check) {
  writeFileSync(OUT_FILE, markdown);
  console.log(`docs/api.md: ${handlers} handlers over ${routes.length} routes, ${contracts.length} contract modules`);
} else {
  const current = readFileSync(OUT_FILE, "utf8");
  if (current === markdown) {
    console.log(`docs/api.md matches the code: ${handlers} handlers over ${routes.length} routes`);
  } else {
    const now = markdown.split("\n");
    const was = current.split("\n");
    // -1 when every line the two share is equal, which means one file simply runs on past the other.
    const differs = now.findIndex((line, index) => line !== was[index]);
    const at = differs === -1 ? Math.min(now.length, was.length) : differs;
    console.error("docs/api.md is out of date with the routes; run `pnpm docs:api`.");
    console.error(`first difference at line ${at + 1}:\n  file: ${was[at] ?? "(end of file)"}\n  code: ${now[at] ?? "(end of file)"}`);
    process.exit(1);
  }
}
