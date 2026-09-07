// Which product route becomes which section of the export, and what the export does with a link that leads
// somewhere it does not carry (blueprint 6.2, 9.12, AC-DEL-01).
//
// The export is one file with one address space: `#<slug>`. Every internal `href` and every GET-form target the
// capture annotated (`data-x-href`) is rewritten here, at build time, so the runtime script has nothing to resolve
// and nothing to guess. A route the file does not carry loses its href and is marked `data-x-absent` with the route
// it would have opened, because a link that silently does nothing is worse than a link that says where it went.
//
// Nothing here invents a target: the slugs are made from the ids the captures and the API already carried.

/** The surface families of 6.2, in inventory order; the order the landing lists them in. */
export const FAMILY_ORDER = [
  "home",
  "ask",
  "trace",
  "documents",
  "assets",
  "failures",
  "coverage",
  "clusters",
  "drafts",
  "integrity",
  "evaluation",
  "loop",
  "landing",
] as const;
export type Family = (typeof FAMILY_ORDER)[number];

export type Classified = {
  /** The section address inside the file. */
  slug: string;
  /** The 6.2 family the route belongs to; the landing lists and the rail highlights by family. */
  family: Family;
  /** The heading the landing gives this section. */
  title: string;
  /** What this surface is for, in the words of 6.2's demo job. */
  note: string;
  /** The route as the product serves it, query included; what the capture asks for. */
  route: string;
};

/** `[A-Za-z0-9_.-]` only, so a slug is safe in a hash and readable in the address bar. */
function slugPart(value: string): string {
  return (
    decodeURIComponent(value)
      .replace(/[^A-Za-z0-9_.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "x"
  );
}

const NOTE: Record<Family, string> = {
  home: "The corpus status, the measured gap and the seeded question chips.",
  ask: "A question answered from the stored packet: one claim per line, every line cited.",
  trace: "The replay of one answer: scope, rule-pack class, retrieval, prompts, verdicts and the six gates.",
  documents: "The document a citation stands on, at the page and the span the chip resolves to.",
  assets: "The fleet and one asset's document graph, interlock matrix, setpoints and proof tests.",
  failures: "The failure history, the causal chains and the families behind them.",
  coverage: "The gap with its method, both layers, the three bands and the ranked clusters.",
  clusters: "One knowledge-debt cluster: its factor snapshot, its uncovered work orders and the action they carry.",
  drafts: "The review queue and one draft in the six-section house template with a source on every element.",
  integrity: "Every finding with its rule, severity and evidence link.",
  evaluation: "The latest ingested golden-set run, its model ids and its failures.",
  loop: "The guided loop: abstain, request, draft, review, publish, ask again.",
  landing: "This screen and the ninety-second tour of the six components.",
};

const INDEX: Record<string, { slug: string; family: Family; title: string }> = {
  "/": { slug: "home", family: "home", title: "Home" },
  "/ask": { slug: "ask", family: "ask", title: "Ask" },
  "/assets": { slug: "assets", family: "assets", title: "Assets" },
  "/failures": { slug: "failures", family: "failures", title: "Failure Memory" },
  "/coverage": { slug: "coverage", family: "coverage", title: "Coverage Console" },
  "/drafts": { slug: "drafts", family: "drafts", title: "Drafts" },
  "/integrity": { slug: "integrity", family: "integrity", title: "Integrity Register" },
  "/evaluation": { slug: "evaluation", family: "evaluation", title: "Evaluation" },
  "/demo/loop": { slug: "loop", family: "loop", title: "Guided loop" },
  // Surface 12 is the export's first screen; the product's own tour markup is what the landing carries.
  "/tour": { slug: "landing", family: "landing", title: "Reviewer landing and tour" },
};

/** Routes the export never carries: the write surfaces, the Admin sheet the demo Engineer cannot read, the API. */
const NEVER = /^\/(login|logout|admin|api\/|_next\/)/;

/**
 * The route a link or a GET-form button leads to, as a section of the export, or null when the export does not
 * carry that route. Query and fragment are read, never dropped: `?chip=` names a seeded answer, `?doc=` a document
 * class tab and `?layer=` a coverage layer, and each is a different surface.
 */
export function classify(rawRoute: string): Classified | null {
  const [pathAndQuery] = rawRoute.split("#");
  const [pathname, query = ""] = (pathAndQuery ?? "").split("?");
  if (!pathname || !pathname.startsWith("/")) return null;
  if (NEVER.test(pathname.slice(0))) return null;
  const params = new URLSearchParams(query);
  const of = (slug: string, family: Family, title: string, route: string): Classified => ({
    slug,
    family,
    title,
    note: NOTE[family],
    route,
  });

  const index = INDEX[pathname];
  if (index) {
    // An index surface with a parameter is a second surface, not the same one: the coverage layer toggle and the
    // integrity filter both answer on the index route.
    const layer = params.get("layer");
    if (pathname === "/coverage" && layer) {
      return of(`coverage-${slugPart(layer)}`, "coverage", `Coverage Console, ${layer} layer`, `${pathname}?layer=${encodeURIComponent(layer)}`);
    }
    const chip = params.get("chip");
    if (pathname === "/ask" && chip) {
      return of(`ask-${slugPart(chip)}`, "ask", `Ask, seeded question ${chip}`, `${pathname}?chip=${encodeURIComponent(chip)}`);
    }
    if ([...params.keys()].length > 0 && pathname !== "/ask" && pathname !== "/coverage") return null;
    return of(index.slug, index.family, index.title, pathname);
  }

  const parts = pathname.split("/").filter(Boolean);
  const [head, id, ...rest] = parts;
  if (!id) return null;
  const clean = decodeURIComponent(id);

  if (head === "trace" && rest.length === 0) return of(`trace-${slugPart(id)}`, "trace", `Trace ${clean}`, pathname);
  if (head === "documents" && rest.length === 0) {
    // The viewer needs the page and the span in the query; the capture asks for exactly what the chip asks for.
    const anchor = params.toString();
    return of(`doc-${slugPart(id)}`, "documents", `Document ${clean}`, anchor ? `${pathname}?${anchor}` : pathname);
  }
  if (head === "drafts" && rest.length === 0) return of(`draft-${slugPart(id)}`, "drafts", `Draft ${clean}`, pathname);
  if (head === "failures" && rest.length === 0) return of(`failure-${slugPart(id)}`, "failures", `Failure memory, ${clean}`, pathname);
  if (head === "coverage" && id === "clusters" && rest.length === 1) {
    return of(`cluster-${slugPart(rest[0] as string)}`, "clusters", `Debt cluster ${decodeURIComponent(rest[0] as string)}`, pathname);
  }
  if (head === "assets" && rest.length === 0) {
    const doc = params.get("doc");
    if (doc) {
      return of(`asset-${slugPart(id)}-${slugPart(doc)}`, "assets", `${clean}, ${doc.replace(/_/g, " ")}`, `${pathname}?doc=${encodeURIComponent(doc)}`);
    }
    return of(`asset-${slugPart(id)}`, "assets", `Asset ${clean}`, pathname);
  }
  return null;
}

/**
 * Rewrite every internal address in a captured surface: `href` and the capture's `data-x-href` become `#<slug>`
 * when the export carries that route, and `data-x-absent="<route>"` when it does not. A form's `action` always
 * becomes `data-x-absent`, whatever it pointed at: no form in this file has a server to submit to, and leaving a
 * server path on it would put an address in a file that is supposed to hold none. An external address (the live
 * URL on the landing) and an in-page fragment are left exactly as they are.
 */
export function rewriteLinks(html: string, slugOf: (route: string) => string | null): string {
  return html.replace(/\s(href|data-x-href|action|formaction)="(\/[^"]*)"/g, (whole, attribute: string, route: string) => {
    const slug = attribute === "action" || attribute === "formaction" ? null : slugOf(route);
    if (slug) return ` ${attribute}="#${slug}"`;
    return ` data-x-absent="${route.replace(/"/g, "&quot;")}"`;
  });
}
