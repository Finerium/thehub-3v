// AC-NFR-23 (blueprint section 11): a clean checkout with the frozen lockfiles builds the application
// byte-identically twice. Run: `pnpm verify:reproducible`.
//
// The check installs from the frozen lockfile, then builds the application twice from an empty `.next/` and
// compares the two outputs as a sorted list of "<sha256>  <path>" lines. A single differing byte in any compiled
// chunk, manifest, prerendered page or trace manifest moves a digest and reddens the run; a file that appears in
// one build and not the other moves the list and reddens it too.
//
// Three things are held out of the comparison, and only these three:
//
//   .next/cache/**   the Turbopack incremental cache. It is not build output: it is deleted before each build
//                    here, is never uploaded with the deployment, and records the order the compiler happened to
//                    visit modules in.
//   .next/trace      the build's own timing trace (spans in microseconds), which is what "excluding timestamps"
//   .next/trace-build in the criterion names.
//
// Four values are masked in place rather than excluded, because they are freshly minted per build and carry no
// information about the source that was compiled. Masking is by exact key, so the rest of every file that holds
// one is still compared byte for byte:
//
//   .next/BUILD_ID and the `static/<BUILD_ID>/` path segment, the build's nanoid.
//   preview.previewModeId, previewModeSigningKey, previewModeEncryptionKey in prerender-manifest.json.
//   encryptionKey in server/server-reference-manifest.js and .json (the Server Actions key).
//
// Measured on 2026-09-08 against Next 16.3.4: two cold builds each wrote 932 files, 22 of them under
// .next/cache, leaving 908 comparable. Unmasked, 28 of those 908 held a different digest and 6 paths existed in
// only one of the two builds; every one of those differences was one of the four values above, and with them
// masked the two snapshots are equal.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".next");

/** Everything under `.next/` except the incremental cache and the build's own timing traces. */
const SKIP = new Set(["trace", "trace-build"]);
const isCache = (rel) => rel === "cache" || rel.startsWith(`cache${path.sep}`);

/** The per-build nonces, masked by key so only the value itself is held out. */
const NONCE = /("(?:previewModeId|previewModeSigningKey|previewModeEncryptionKey|encryptionKey)\\?"\s*:\s*\\?")[^"\\]+/g;

function files(dir, rel = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = rel ? path.join(rel, entry.name) : entry.name;
    if (isCache(next) || SKIP.has(next)) continue;
    if (entry.isDirectory()) found.push(...files(path.join(dir, entry.name), next));
    else if (entry.isFile()) found.push(next);
  }
  return found;
}

/** "<sha256>  <path>" for every comparable file, sorted, with the build id masked in both path and content. */
function snapshot() {
  const id = readFileSync(path.join(out, "BUILD_ID"), "utf8").trim();
  if (!/^[A-Za-z0-9_-]{16,}$/.test(id)) throw new Error(`.next/BUILD_ID does not look like a build id: ${id}`);
  const lines = files(out).map((rel) => {
    // latin1 round-trips every byte, so a compiled font or image is masked and hashed as safely as a manifest.
    const masked = readFileSync(path.join(out, rel)).toString("latin1").split(id).join("<BUILD_ID>").replace(NONCE, "$1<NONCE>");
    const digest = createHash("sha256").update(Buffer.from(masked, "latin1")).digest("hex");
    return `${digest}  ${rel.split(id).join("<BUILD_ID>")}`;
  });
  return lines.sort().join("\n");
}

function build(which) {
  rmSync(out, { recursive: true, force: true });
  process.stdout.write(`build ${which} of 2 (from an empty .next/) `);
  execFileSync("pnpm", ["build"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const snap = snapshot();
  console.log(`wrote ${snap.split("\n").length} comparable files`);
  return snap;
}

execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const first = build(1);
const second = build(2);

if (first === second) {
  console.log(`reproducible: ${first.split("\n").length} files, identical digests across two cold builds`);
  process.exit(0);
}

const dir = mkdtempSync(path.join(tmpdir(), "reproducible-build-"));
writeFileSync(path.join(dir, "build-1.txt"), `${first}\n`);
writeFileSync(path.join(dir, "build-2.txt"), `${second}\n`);
const a = new Map(first.split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
const b = new Map(second.split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
for (const rel of [...new Set([...a.keys(), ...b.keys()])].sort()) {
  if (a.get(rel) !== b.get(rel)) console.log(`  differs: ${rel} (${a.get(rel) ?? "absent"} vs ${b.get(rel) ?? "absent"})`);
}
console.log(`NOT reproducible; the two snapshots are in ${dir}`);
process.exit(1);
