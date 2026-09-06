// `pnpm bundle:pull <semver>` (ARCHITECTURE 2, the pull step of the seam; blueprint 9.1; D-17): downloads
// thehub-bundle-<semver>.tar.gz and SHA256SUMS from the GitHub release v<semver> of Finerium/thehub-harness
// (`gh release download`, else the public asset URL through fetch), verifies the archive's sha256 against
// SHA256SUMS, unpacks the public part into bundle/ and writes bundle/PULLED.txt with the semver and that sha256.
// The seed-time files (chunks.jsonl, opls.json, pages/, text/: corpus text and imagery) are never unpacked, even if
// an archive carried them: the set comes from contracts/bundle_map.json (the archive's copy if shipped, else the
// sibling harness checkout) on top of the fixed D-17 floor. Every download and every check happens in a temporary
// directory and bundle/ is written only after all of them passed, so a release that is not published yet, a bad
// digest, an unlisted member or a mismatched file leaves bundle/ as it was and exits 1. Nothing in bundle/ is
// deleted: files of an earlier pull that the new archive does not carry stay where they are.
import { spawnSync } from "node:child_process";
import { createWriteStream, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { z } from "zod";
import { Manifest } from "../../src/contracts/generated/manifest";
import { seededVersionId, sha256Hex } from "../../src/lib/version-id";

const REPO = "Finerium/thehub-harness";
const RELEASE_BASE = `https://github.com/${REPO}/releases`;
const BUNDLE_MAP_MEMBER = "contracts/bundle_map.json";
// D-17: the seed-time artefacts, produced where the corpus exists; the floor under whatever bundle_map.json says.
const SEED_TIME_FLOOR: readonly string[] = ["chunks.jsonl", "opls.json", "pages/", "text/"];

const REPO_ROOT = process.cwd();
const BUNDLE_DIR = path.join(REPO_ROOT, "bundle");
const HARNESS_DIR = process.env.HARNESS_DIR ?? path.resolve(REPO_ROOT, "../thehub-harness");

const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, "a semver such as 1.0.0");
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const SeedTimeFlag = z.looseObject({ seed_time: z.boolean().optional() });
const BundleMap = z.looseObject({
  files: z.record(z.string(), SeedTimeFlag),
  prefixes: z.record(z.string(), SeedTimeFlag).optional(),
});

class ReleaseNotPublished extends Error {}

function fail(message: string): never {
  console.error(`bundle:pull failed: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Download: gh first (a public release needs no token), the asset URL through fetch when gh is absent or refuses
// ---------------------------------------------------------------------------------------------------------------
async function fetchAsset(url: string, target: string): Promise<void> {
  // egress: the public release asset on github.com under the SHA256SUMS check below, never a provider (INV-4); the
  // same class as the pinned model download of scripts/models/fetch.ts, which scripts/audits/provider-egress.sh
  // allowlists by path.
  const response = await fetch(url, { redirect: "follow" });
  if (response.status === 404) throw new ReleaseNotPublished(`HTTP 404 on ${url}`);
  if (!response.ok || !response.body) throw new Error(`download failed: ${url} -> HTTP ${response.status}`);
  const out = createWriteStream(target);
  Readable.fromWeb(response.body as WebReadableStream<Uint8Array>).pipe(out);
  await finished(out);
}

async function download(semver: string, tarball: string, dir: string): Promise<"gh" | "fetch"> {
  const tag = `v${semver}`;
  const gh = spawnSync(
    "gh",
    ["release", "download", tag, "--repo", REPO, "--pattern", "SHA256SUMS", "--pattern", tarball, "--dir", dir, "--clobber"],
    { encoding: "utf8" },
  );
  if (gh.status === 0 && existsSync(path.join(dir, tarball)) && existsSync(path.join(dir, "SHA256SUMS"))) return "gh";
  const reason = gh.error ? gh.error.message : (gh.stderr ?? "").trim().split("\n")[0] || `exit ${gh.status}`;
  console.log(`gh release download did not complete (${reason}); fetching the release assets instead`);
  for (const name of ["SHA256SUMS", tarball]) {
    await fetchAsset(`${RELEASE_BASE}/download/${tag}/${name}`, path.join(dir, name));
  }
  return "fetch";
}

// The `sha256sum` line for the archive: "<hex>  <name>".
function expectedDigest(sums: string, tarball: string): string {
  for (const line of sums.split("\n")) {
    const [digest, name] = line.trim().split(/\s+/);
    if (name === tarball && digest !== undefined) return Sha256.parse(digest);
  }
  throw new Error(`SHA256SUMS carries no line for ${tarball}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The seed-time set: bundle_map.json semantics (files and prefixes flagged seed_time) over the D-17 floor
// ---------------------------------------------------------------------------------------------------------------
// A shipped copy is read from a scratch directory of its own, never from the bundle tree.
function seedTimeSet(work: string, tar: (args: string[]) => string, tarball: string, members: string[], prefix: string): string[] {
  const set = new Set(SEED_TIME_FLOOR);
  const shipped = `${prefix}/${BUNDLE_MAP_MEMBER}`;
  const sibling = path.join(HARNESS_DIR, ...BUNDLE_MAP_MEMBER.split("/"));
  let raw: string | null = null;
  let source: string;
  if (members.includes(shipped)) {
    const dir = path.join(work, "map");
    mkdirSync(dir);
    tar(["-xzf", tarball, "-C", dir, shipped]);
    raw = readFileSync(path.join(dir, shipped), "utf8");
    source = "the archive";
  } else if (existsSync(sibling)) {
    raw = readFileSync(sibling, "utf8");
    source = sibling;
  } else {
    source = "nowhere (the fixed D-17 set applies)";
  }
  if (raw !== null) {
    const map = BundleMap.parse(JSON.parse(raw));
    for (const [file, flag] of Object.entries(map.files)) if (flag.seed_time) set.add(file);
    for (const [dir, flag] of Object.entries(map.prefixes ?? {})) if (flag.seed_time) set.add(dir);
  }
  console.log(`seed-time set from ${source}: ${[...set].sort().join(", ")}`);
  return [...set];
}

function isSeedTime(rel: string, seedTime: readonly string[]): boolean {
  return seedTime.some((entry) => (entry.endsWith("/") ? rel.startsWith(entry) : rel === entry));
}

// Every file under `dir`, relative, with forward slashes.
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------
async function main(): Promise<void> {
  const parsed = Semver.safeParse(process.argv[2]);
  if (!parsed.success) {
    console.error("usage: pnpm bundle:pull <semver>   (the release tag is v<semver>, for example 1.0.0)");
    process.exit(2);
  }
  const semver = parsed.data;
  const prefix = `thehub-bundle-${semver}`;
  const tarballName = `${prefix}.tar.gz`;
  const work = mkdtempSync(path.join(os.tmpdir(), "thehub-bundle-pull-"));
  const tar = (args: string[]): string => {
    const run = spawnSync("tar", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(`tar ${args[0]} failed: ${(run.stderr ?? run.error?.message ?? "").trim()}`);
    return run.stdout;
  };

  try {
    const downloads = path.join(work, "downloads");
    mkdirSync(downloads);
    const via = await download(semver, tarballName, downloads);
    const tarball = path.join(downloads, tarballName);

    // 1. The archive's sha256 against SHA256SUMS.
    const expected = expectedDigest(readFileSync(path.join(downloads, "SHA256SUMS"), "utf8"), tarballName);
    const actual = sha256Hex(readFileSync(tarball));
    if (actual !== expected) fail(`sha256 mismatch on ${tarballName}: SHA256SUMS ${expected}, downloaded ${actual}; bundle/ untouched`);
    console.log(`verified ${tarballName} sha256 ${actual} (via ${via})`);

    // 2. The member list: every entry under the release prefix, no traversal, seed-time paths set aside.
    const members = tar(["-tzf", tarball]).split("\n").map((m) => m.trim()).filter((m) => m !== "" && !m.endsWith("/"));
    for (const member of members) {
      const parts = member.split("/");
      if (parts[0] !== prefix || member.startsWith("/") || parts.some((p) => p === "" || p === "." || p === "..")) {
        fail(`archive member outside ${prefix}/: ${member}; bundle/ untouched`);
      }
    }
    const unpack = path.join(work, "unpack");
    mkdirSync(unpack);
    const seedTime = seedTimeSet(work, tar, tarball, members, prefix);
    const allowed = members.filter((m) => !isSeedTime(m.slice(prefix.length + 1), seedTime));
    const skipped = members.length - allowed.length;
    if (skipped > 0) console.log(`${skipped} seed-time members in the archive are not unpacked (D-17)`);
    if (!allowed.includes(`${prefix}/manifest.json`)) fail(`${prefix}/manifest.json is not in the archive; bundle/ untouched`);

    // 3. Extract only the allowed members into the temporary tree.
    tar(["-xzf", tarball, "-C", unpack, ...allowed]);
    const tree = path.join(unpack, prefix);

    // 4. The manifest (9.1 contract) names the version and lists every file with its digest; the tree must match it.
    const manifestBytes = readFileSync(path.join(tree, "manifest.json"));
    const manifest = Manifest.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (manifest.bundle_version !== semver) fail(`manifest bundle_version ${manifest.bundle_version} differs from ${semver}; bundle/ untouched`);
    const listed = new Map(manifest.files.map((f) => [f.path, f] as const));
    const present = walk(tree).filter((rel) => rel !== "manifest.json");
    for (const rel of present) {
      if (isSeedTime(rel, seedTime)) fail(`seed-time file ${rel} reached the unpack tree; bundle/ untouched`);
      const entry = listed.get(rel);
      if (!entry) fail(`${rel} is not listed in manifest.json; bundle/ untouched`);
      const bytes = readFileSync(path.join(tree, rel));
      if (bytes.byteLength !== entry.bytes || sha256Hex(bytes) !== entry.sha256) fail(`${rel} differs from its manifest entry; bundle/ untouched`);
    }
    const presentSet = new Set(present);
    const missing = [...listed.keys()].filter((rel) => !isSeedTime(rel, seedTime) && !presentSet.has(rel));
    if (missing.length > 0) fail(`manifest lists public files the archive does not carry: ${missing.join(", ")}; bundle/ untouched`);
    const seedTimeListed = [...listed.keys()].filter((rel) => isSeedTime(rel, seedTime)).length;

    // 5. Everything passed: write bundle/ (overwrite, never delete) and the pin.
    mkdirSync(BUNDLE_DIR, { recursive: true });
    cpSync(tree, BUNDLE_DIR, { recursive: true });
    const pulled = [
      `bundle_version: ${semver}`,
      `tarball: ${tarballName}`,
      `tarball_sha256: ${actual}`,
      `harness_commit: ${manifest.harness_commit}`,
      `release: ${RELEASE_BASE}/tag/v${semver}`,
      "",
    ].join("\n");
    writeFileSync(path.join(BUNDLE_DIR, "PULLED.txt"), pulled);

    const written = present.length + 1;
    console.log(
      `bundle:pull ok: ${written} files into ${path.relative(REPO_ROOT, BUNDLE_DIR)}/ from release v${semver} ` +
        `(${statSync(tarball).size} bytes, sha256 ${actual.slice(0, 12)}); ` +
        `${seedTimeListed} seed-time files listed in the manifest stay absent until the seed produces them (D-17); ` +
        `seeded version id ${seededVersionId(manifest.bundle_version, sha256Hex(manifestBytes))}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  if (error instanceof ReleaseNotPublished) {
    fail(`release v${process.argv[2]} of ${REPO} is not published yet (${error.message}); bundle/ untouched`);
  }
  fail(`${error instanceof Error ? error.message : String(error)}; bundle/ untouched`);
});
