// The daily budget check (ARCHITECTURE 9.3, AC-NFR-15, AC-ANS-20): today's rows of the task's 9.13 role are summed
// (input plus output tokens, UTC day) and priced with the constants of config.ts; either cap exhausts. The database
// is the fake client, so the sum is whatever the test queues.
import { beforeEach, describe, expect, it } from "vitest";
import { queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { budgetStatus, utcDayStart } from "./budget";
import { BUDGETS, spendIdr } from "./config";

beforeEach(() => {
  resetFakeDb();
});

describe("utcDayStart", () => {
  it("is midnight UTC of the given instant", () => {
    expect(utcDayStart(new Date("2026-09-05T13:45:10.000Z")).toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-09-05T23:59:59.999Z")).toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });
});

describe("budgetStatus", () => {
  const now = new Date("2026-09-05T13:45:10.000Z");

  it("sums today's tokens of the role, prices them and is not exhausted below both caps", async () => {
    queueResult([{ input: 1000, output: 200 }]);
    const status = await budgetStatus("AG-2", now);
    expect(status).toEqual({
      role: "AG-2",
      day: "2026-09-05",
      tokens_used: 1200,
      tokens_per_day: BUDGETS["AG-2"].tokens_per_day,
      spend_idr: spendIdr(1000, 200),
      spend_cap_idr_per_day: BUDGETS["AG-2"].spend_cap_idr_per_day,
      exhausted: false,
    });
    expect(statements).toHaveLength(1);
    expect(statements[0].map((c) => c.method)).toEqual(["select", "from", "where"]);
  });

  it("is exhausted at the token cap", async () => {
    queueResult([{ input: BUDGETS["AG-2"].tokens_per_day - 1, output: 1 }]);
    expect((await budgetStatus("AG-2", now)).exhausted).toBe(true);
    queueResult([{ input: BUDGETS["AG-2"].tokens_per_day - 1, output: 0 }]);
    expect((await budgetStatus("AG-2", now)).exhausted).toBe(false);
  });

  it("is exhausted at the spend cap before the token cap when output tokens dominate", async () => {
    const output = 2_300_000; // below tokens_per_day, above the IDR cap at the output price
    queueResult([{ input: 0, output }]);
    const status = await budgetStatus("AG-2", now);
    expect(status.tokens_used).toBeLessThan(status.tokens_per_day);
    expect(status.spend_idr).toBeGreaterThanOrEqual(status.spend_cap_idr_per_day);
    expect(status.exhausted).toBe(true);
  });

  it("reads an empty day as zero and the redline task under the shared role AG-4", async () => {
    queueResult([]);
    const status = await budgetStatus("AG-4/redline", now);
    expect(status).toMatchObject({ role: "AG-4", tokens_used: 0, spend_idr: 0, exhausted: false });
    expect(status.tokens_per_day).toBe(BUDGETS["AG-4"].tokens_per_day);
  });
});
