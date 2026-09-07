// The fourteen surfaces of blueprint 6.2, as data, so that one list is what every browser spec walks and a surface
// that is added, renamed or lost changes the walk rather than being forgotten by it. surfaces.spec.ts renders each
// one, axe.spec.ts audits each one, a11y.spec.ts walks each one by keyboard; all three iterate this file.
//
// WHICH SURFACE ANSWERS TO WHICH CRITERION (blueprint section 11)
//   AC-UI-01  the fourteen surfaces render, a citation chip opens its span, every asserted value read at run time
//             from bundle/fixtures.json. Every surface below carries it; the chip leg is chip-to-span.spec.ts.
//   AC-UI-02  every edge and honesty state of 6.3 renders as a designed state with next steps. The state tour is
//             states.spec.ts; the surfaces that decide a state (8 Drafts, 13 Admin, 14 Auth) carry it here too.
//   AC-UI-04  the reviewer landing and the tour of ES1 to ES6 (surface 12). D-07 withdrew the login-free signed
//             link, so /tour/:token is retired below and /tour is the post-login landing.
//   AC-UI-05  Home's 24 seeded chips, each answered from a stored packet (surface 1). seeded-chips.spec.ts.
//   AC-UI-06  axe on every surface, the keyboard walk of the fourteen and the guided route, the screen-reader
//             roles of the abstention and refusal states, the reduced-motion static experience. a11y.spec.ts.
//
// Nothing here types an id of the seeded corpus: every address that carries one resolves it from the route that
// owns it, the same way helpers.ts does.
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { TAG, datasheetId, firstClusterId, getJson, readAsset, traceIdFromSearch } from "./helpers";

/** A draft id no browser ever minted, so surface 8's detail route is walked even when the sandbox holds no draft. */
export const ABSENT_DRAFT_ID = "dr-00000000-0000-4000-8000-000000000000";

/** One address of a surface, as this run opens it. */
export type Opened = {
  href: string;
  /** The designed state this address renders for the demo Engineer, when the full surface is not what it shows. */
  designed?: "403" | "404";
  /** Why the designed state and not the surface: stated in the test title so a skip is never silent. */
  because?: string;
};

export type View = {
  /** The address as 6.2 writes it. */
  pattern: string;
  /** How a test names it: "the fleet table", "the asset page". */
  label: string;
  open: (api: APIRequestContext) => Promise<Opened>;
  /** /login redirects a signed-in browser, so this view is opened by a context holding no session. */
  signedOut?: boolean;
};

export type Surface = {
  /** The 6.2 number, 1 to 14. */
  n: number;
  name: string;
  /** The criteria of section 11 this surface answers. */
  criteria: readonly string[];
  views: readonly View[];
  /** An address of this surface a deviation removed: named, with its deviation id, never silently dropped. */
  retired?: { pattern: string; deviation: string; what: string };
};

const at = (href: string) => async (): Promise<Opened> => ({ href });

/** Open one address and wait for the surface, or for the designed state that address answers with, to have drawn. */
export async function settled(page: Page, href: string, designed?: string): Promise<void> {
  await page.goto(href);
  if (designed) await expect(page.locator(`[data-designed-state="${designed}"]`)).toBeVisible();
  else await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** The first draft this browser's sandbox holds, or null: a draft costs two provider calls, so no spec makes one. */
export async function firstDraftId(api: APIRequestContext): Promise<string | null> {
  const body = (await getJson(api, "/api/drafts")) as unknown as { drafts: Array<{ id: string }> };
  return body.drafts[0]?.id ?? null;
}

export const SURFACES: readonly Surface[] = [
  {
    n: 1,
    name: "Home",
    criteria: ["AC-UI-01", "AC-UI-05", "AC-UI-06"],
    views: [{ pattern: "/", label: "the corpus panel, the gap headline and the seeded chips", open: at("/") }],
  },
  {
    n: 2,
    name: "Ask",
    criteria: ["AC-UI-01", "AC-UI-02", "AC-UI-06"],
    views: [{ pattern: "/ask", label: "the question form and the seeded lane", open: at("/ask") }],
  },
  {
    n: 3,
    name: "Trace",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [
      {
        pattern: "/trace/:id",
        label: "the replay of one retrieval",
        // One retrieval-only search call: no model, no provider, one immutable trace row.
        open: async (api) => ({ href: `/trace/${encodeURIComponent(await traceIdFromSearch(api, `${TAG} datasheet`))}` }),
      },
    ],
  },
  {
    n: 4,
    name: "Document viewer",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [
      {
        pattern: "/documents/:id",
        label: "the asset's datasheet at page one",
        open: async (api) => ({ href: `/documents/${encodeURIComponent(datasheetId(await readAsset(api)))}` }),
      },
    ],
  },
  {
    n: 5,
    name: "Assets",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [
      { pattern: "/assets", label: "the fleet table", open: at("/assets") },
      { pattern: "/assets/:tag", label: "the asset sheet", open: at(`/assets/${TAG}`) },
    ],
  },
  {
    n: 6,
    name: "Failure Memory",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [
      { pattern: "/failures", label: "the fleet failure summary", open: at("/failures") },
      { pattern: "/failures/:tag", label: "the asset's history and its chains", open: at(`/failures/${TAG}`) },
    ],
  },
  {
    n: 7,
    name: "Coverage Console",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [
      { pattern: "/coverage", label: "both layers, the three bands and the method chip", open: at("/coverage") },
      {
        pattern: "/coverage/clusters/:id",
        label: "a ranked debt cluster",
        open: async (api) => ({ href: `/coverage/clusters/${encodeURIComponent(await firstClusterId(api))}` }),
      },
    ],
  },
  {
    n: 8,
    name: "Drafts",
    criteria: ["AC-UI-01", "AC-UI-02", "AC-UI-06"],
    views: [
      { pattern: "/drafts", label: "the review queue by state", open: at("/drafts") },
      {
        pattern: "/drafts/:id",
        label: "the draft sheet",
        // A draft is two provider calls, so no spec creates one: when the sandbox holds none, the detail route is
        // walked at an address no browser minted and must answer with the designed 404 of 6.3, never a stack trace.
        open: async (api) => {
          const id = await firstDraftId(api);
          return id === null
            ? { href: `/drafts/${ABSENT_DRAFT_ID}`, designed: "404", because: "this browser's sandbox holds no draft, and no spec spends two provider calls to make one" }
            : { href: `/drafts/${encodeURIComponent(id)}` };
        },
      },
    ],
  },
  {
    n: 9,
    name: "Integrity Register",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [{ pattern: "/integrity", label: "the findings, the totals and the rule ledger", open: at("/integrity") }],
  },
  {
    n: 10,
    name: "Evaluation",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [{ pattern: "/evaluation", label: "the latest ingested run with its pins", open: at("/evaluation") }],
  },
  {
    n: 11,
    name: "Guided loop",
    criteria: ["AC-UI-01", "AC-UI-06"],
    views: [{ pattern: "/demo/loop", label: "the guided route, at its first step", open: at("/demo/loop") }],
  },
  {
    n: 12,
    name: "Reviewer landing and tour",
    criteria: ["AC-UI-01", "AC-UI-04", "AC-UI-06"],
    views: [{ pattern: "/tour", label: "the landing and the six steps ES1 to ES6", open: at("/tour") }],
    retired: {
      pattern: "/tour/:token",
      deviation: "D-07",
      what: "the login-free signed per-role link, its expiry, its revocation and the REVIEWER_LINK_SECRET rotation were withdrawn and the whole deployment put behind login; /tour is the post-login landing",
    },
  },
  {
    n: 13,
    name: "Admin",
    criteria: ["AC-UI-01", "AC-UI-02", "AC-UI-06"],
    views: [
      {
        pattern: "/admin",
        label: "the corpus versions, the accounts and the pins",
        // INV-3 as a person meets it: the demo Engineer is told the surface is closed to the role, in a designed
        // state with a next step. The Admin's own read is admin.spec.ts, which skips without ADMIN_PASSWORD.
        open: async () => ({ href: "/admin", designed: "403", because: "this run holds the demo Engineer session, and Admin is closed to every other role (9.9)" }),
      },
    ],
  },
  {
    n: 14,
    name: "Auth",
    criteria: ["AC-UI-01", "AC-UI-02", "AC-UI-06"],
    views: [{ pattern: "/login", label: "the credentials form of the demo accounts", open: at("/login"), signedOut: true }],
  },
] as const;

/** Every address of every surface, flattened, in 6.2 order. */
export const VIEWS: ReadonlyArray<{ surface: Surface; view: View; title: string }> = SURFACES.flatMap((surface) =>
  surface.views.map((view) => ({
    surface,
    view,
    title: `6.2 surface ${surface.n}, ${surface.name} ${view.pattern}: ${view.label}`,
  })),
);
