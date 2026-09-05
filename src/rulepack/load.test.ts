// The pack is read once from the tracked bundle copy and validated against the generated RulePack contract while the
// module loads (ADR-002 "read by pointer"; invariant 1): the loaded object is the file on disk, and a file that
// does not match the contract fails the import, so nothing can classify against an unvalidated pack.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pack, packVersion } from "./load";

const PACK_FILE = path.join(process.cwd(), "bundle", "rulepack", "v1.json");

describe("the loaded pack", () => {
  it("is the tracked bundle copy, version 1", () => {
    expect(pack).toEqual(JSON.parse(readFileSync(PACK_FILE, "utf8")));
    expect(packVersion).toBe("1");
    expect(pack.version).toBe(packVersion);
  });
});

describe("a pack that does not match the contract", () => {
  afterEach(() => {
    vi.doUnmock("../../bundle/rulepack/v1.json");
    vi.resetModules();
  });

  it("fails the import with the contract named, before any request can be classified", async () => {
    vi.resetModules();
    vi.doMock("../../bundle/rulepack/v1.json", () => ({ default: { version: "2" } }));
    await expect(import("./load")).rejects.toThrow(/does not match the RulePack contract \(blueprint 9\.10\): version/);
  });
});
