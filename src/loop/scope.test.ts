// The per-browser draft sandbox (blueprint section 2 "per-session draft store", D-16, ARCHITECTURE 8.5;
// AC-LOOP-13, NFR-17). A draft created through the product carries session_scope = the visitor's sandbox id; the
// queue and the detail route show session_scope IS NULL OR session_scope = that id, so the seeded drafts (scope
// null, the replay sources) are visible to everyone and one visitor's draft never reaches another visitor. The
// predicate is a Drizzle fragment, read here through the Postgres dialect with no connection. Pure: no database.
import { describe, expect, it } from "vitest";
import { draftScope, visibleScope } from "./scope";
import { SANDBOX_ID, SANDBOX_ROW, queryOf } from "../../tests/fixtures/drafting";

const OTHER = { ...SANDBOX_ROW, id: "sbx1111111111111111111111111111111111111111" };

describe("draftScope", () => {
  it("scopes a new draft to the visitor's sandbox", () => {
    expect(draftScope(SANDBOX_ROW)).toBe(SANDBOX_ID);
  });

  it("scopes to null when the browser carries no sandbox, which is what a seeded replay source holds", () => {
    expect(draftScope(null)).toBeNull();
  });
});

describe("visibleScope", () => {
  it("admits the seeded drafts and the visitor's own, by id and by nothing else", () => {
    const query = queryOf(visibleScope(SANDBOX_ROW));
    const sql = query.sql.toLowerCase();

    expect(sql).toContain("session_scope");
    expect(sql).toContain("is null");
    expect(sql).toContain(" or ");
    expect(query.params).toEqual([SANDBOX_ID]);
  });

  it("admits only the seeded drafts before the first login, when no sandbox cookie exists", () => {
    const query = queryOf(visibleScope(null));
    expect(query.sql.toLowerCase()).toContain("is null");
    expect(query.params).toEqual([]);
  });

  it("never names another visitor's sandbox: two browsers get two predicates (AC-LOOP-13)", () => {
    const mine = queryOf(visibleScope(SANDBOX_ROW));
    const theirs = queryOf(visibleScope(OTHER));

    expect(mine.params).not.toContain(OTHER.id);
    expect(theirs.params).not.toContain(SANDBOX_ID);
    expect(mine.sql).toBe(theirs.sql); // the same shape, a different bound value: no id is ever interpolated
  });
});
