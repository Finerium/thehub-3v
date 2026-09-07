// Everything the export has to swallow so the file makes no request (blueprint 9.12, AC-DEL-01): the product's own
// stylesheets, the three font faces behind them, and the page derivatives the shown citations need.
//
// Nothing is restyled and nothing is re-rendered here. The CSS is the CSS `next start` served, byte for byte, with
// same-origin `url(...)` references turned into `data:` URIs; the images are the derivative bytes the product served
// at its one stored width (ADR-010), so "at render size" needs no resampling and no image library.
import { getBytes, type SessionCookies } from "./snapshot";

/** Any `url(...)` in a stylesheet, quoted or not; the font files next/font emits are addressed relatively. */
const CSS_ANY_URL = /url\((["']?)([^)"']+)\1\)/g;

/**
 * Turn every relative `url(...)` of one stylesheet into the path the server serves it at. The sheets are then
 * concatenated into one block and lose their own address, so this has to happen while each sheet still knows it:
 * next/font writes `url(../media/<hash>.woff2)` from `/_next/static/chunks/<sheet>.css`.
 */
function absolutise(css: string, sheetRoute: string): string {
  const directory = sheetRoute.slice(0, sheetRoute.lastIndexOf("/") + 1);
  return css.replace(CSS_ANY_URL, (whole, quote: string, value: string) => {
    if (/^(data:|https?:|\/\/|#|\/)/.test(value)) return whole;
    return `url(${quote}${new URL(value, `http://stylesheet${directory}`).pathname}${quote})`;
  });
}

/** Fetch every stylesheet the surfaces linked, once each, in first-seen order. */
export async function collectCss(
  baseUrl: string,
  hrefs: readonly string[],
  cookies: SessionCookies,
): Promise<{ css: string; sheets: string[] }> {
  const seen = new Set<string>();
  const parts: string[] = [];
  const sheets: string[] = [];
  for (const href of hrefs) {
    const route = href.startsWith("/") ? href : new URL(href, baseUrl).pathname + new URL(href, baseUrl).search;
    if (seen.has(route)) continue;
    seen.add(route);
    const got = await getBytes(baseUrl, route, cookies);
    if (!got) throw new Error(`stylesheet ${route} did not answer 200; the export would render unstyled`);
    parts.push(absolutise(got.bytes.toString("utf8"), route));
    sheets.push(route);
  }
  return { css: parts.join("\n"), sheets };
}

const MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

function mimeOf(route: string, served: string): string {
  const clean = served.split(";")[0]?.trim() ?? "";
  if (clean && clean !== "application/octet-stream") return clean;
  const extension = route.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return MIME[extension] ?? "application/octet-stream";
}

function dataUri(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Every same-origin `url(...)` in the CSS: the three font families and anything else the sheet reaches for. */
const CSS_URL = /url\((["']?)(\/[^)"']+)\1\)/g;

/**
 * Turn the CSS's own `url(/_next/...)` references into `data:` URIs. The woff2 files next/font emitted are already
 * the latin subset it built at compile time, so this embeds a subset rather than a whole family; what it costs is
 * reported, because the budget decides whether it stays.
 */
export async function embedFontFiles(
  css: string,
  baseUrl: string,
  cookies: SessionCookies,
): Promise<{ css: string; files: Array<{ route: string; bytes: number }> }> {
  const routes = [...new Set([...css.matchAll(CSS_URL)].map((m) => m[2] as string))];
  const files: Array<{ route: string; bytes: number }> = [];
  const uris = new Map<string, string>();
  for (const route of routes) {
    const got = await getBytes(baseUrl, route, cookies);
    if (!got) throw new Error(`the stylesheet asks for ${route}, which did not answer 200`);
    uris.set(route, dataUri(mimeOf(route, got.contentType), got.bytes));
    files.push({ route, bytes: got.bytes.byteLength });
  }
  return { css: css.replace(CSS_URL, (whole, _q, route: string) => `url(${uris.get(route) ?? whole})`), files };
}

/**
 * Walk the `@font-face` blocks of a stylesheet and keep the ones a rule admits. `@font-face` never nests, so one
 * brace scan is the whole parser; everything between the blocks is passed through untouched.
 */
function filterFontFaces(css: string, keep: (block: string) => boolean): { css: string; dropped: number } {
  let out = "";
  let cursor = 0;
  let dropped = 0;
  for (;;) {
    const at = css.indexOf("@font-face", cursor);
    if (at === -1) break;
    const open = css.indexOf("{", at);
    if (open === -1) break;
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    const block = css.slice(at, i);
    out += css.slice(cursor, at);
    if (keep(block)) out += block;
    else dropped += 1;
    cursor = i;
  }
  return { css: out + css.slice(cursor), dropped };
}

/**
 * The subset of 9.12: keep the basic-latin face of each family and drop the rest. next/font emits one file per
 * Unicode subset (latin, latin-ext, greek, cyrillic, vietnamese); the export is English over an English corpus, so
 * the latin face, whose `unicode-range` carries the `U+??` wildcard for U+0000 to U+00FF and the general
 * punctuation this build renders, is the one the file carries. A face with no `unicode-range` is next/font's own
 * metric-matched local fallback and is always kept.
 */
export function subsetFontFaces(css: string): { css: string; dropped: number } {
  return filterFontFaces(css, (block) => !block.includes("unicode-range") || /unicode-range:[^;}]*U\+\?\?/.test(block));
}

/**
 * The byte-budget fallback of 9.12: drop every `@font-face` that would carry a file and keep the ones next/font
 * declares with `local(...)` and its `ascent-override`, `descent-override` and `size-adjust` metrics. The CSS
 * variables are untouched, so each family falls through to its own metric-matched local face and the page keeps its
 * line boxes.
 */
export function dropRemoteFontFaces(css: string): { css: string; dropped: number } {
  return filterFontFaces(css, (block) => !block.includes("url("));
}

export type ImageBudget = {
  /** Derivatives already embedded, by route, so a page shown twice costs its bytes once. */
  cache: Map<string, string>;
  /** Total embedded bytes, before base64 expansion. */
  bytes: number;
  /** Routes that did not answer 200; their `<img>` loses its src rather than reaching for the network. */
  failed: string[];
  /** Routes dropped because the budget was already spent. */
  skipped: string[];
  /** The ceiling this build gives page derivatives. */
  limit: number;
};

export function newImageBudget(limit: number): ImageBudget {
  return { cache: new Map(), bytes: 0, failed: [], skipped: [], limit };
}

/** Same-origin `src="/..."`, which in this product is only ever a page derivative (two `<img>` sites in src/). */
const IMG_SRC = /(<img\b[^>]*?)\ssrc="(\/[^"]*)"/g;

/**
 * Replace every same-origin image source with the bytes the product served under the role check. A derivative the
 * budget cannot take, or that did not answer, loses its `src` and is marked: an `<img>` with no source makes no
 * request, and its `alt` (the document, the page and the page count) still says what stood there.
 */
export async function inlineImages(html: string, baseUrl: string, cookies: SessionCookies, budget: ImageBudget): Promise<string> {
  const routes = [...new Set([...html.matchAll(IMG_SRC)].map((m) => m[2] as string))];
  for (const route of routes) {
    if (budget.cache.has(route) || budget.failed.includes(route) || budget.skipped.includes(route)) continue;
    if (budget.bytes >= budget.limit) {
      budget.skipped.push(route);
      continue;
    }
    const got = await getBytes(baseUrl, route, cookies);
    if (!got) {
      budget.failed.push(route);
      continue;
    }
    budget.cache.set(route, dataUri(mimeOf(route, got.contentType), got.bytes));
    budget.bytes += got.bytes.byteLength;
  }
  return html.replace(IMG_SRC, (_whole, head: string, route: string) => {
    const uri = budget.cache.get(route);
    return uri ? `${head} src="${uri}"` : `${head} data-x-image-absent="${route}"`;
  });
}
