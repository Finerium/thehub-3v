// The stand-in for src/db/client.ts under Vitest (vitest.config.ts aliases `@/db/client` here). A Drizzle query is a
// fluent chain that is awaited at the end; this fake records every chain as the list of methods called with their
// arguments and settles it with the next queued value (an Error rejects). Nothing here opens a connection: a unit
// test that forgets to queue a result gets `undefined`, never a database.
type Call = { method: string; args: unknown[] };
export type Statement = Call[];

const queue: unknown[] = [];
export const statements: Statement[] = [];

/** Queue what the next awaited chain settles with: rows for a select, anything for a write, an Error to reject. */
export function queueResult(value: unknown): void {
  queue.push(value);
}

export function resetFakeDb(): void {
  queue.length = 0;
  statements.length = 0;
}

/** The recorded chain whose method list contains `method` (for example "insert"), or undefined. */
export function statementWith(method: string): Statement | undefined {
  return statements.find((s) => s.some((c) => c.method === method));
}

/** The first argument of `method` inside a recorded chain (the values of an insert, the SQL of a where). */
export function argOf(statement: Statement, method: string): unknown {
  return statement.find((c) => c.method === method)?.args[0];
}

function chain(calls: Statement): unknown {
  return new Proxy(Object.create(null) as object, {
    get(_target, prop) {
      if (prop === "then") {
        statements.push(calls);
        const value = queue.shift();
        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          value instanceof Error ? reject(value) : resolve(value);
      }
      if (typeof prop !== "string") return undefined;
      return (...args: unknown[]) => chain([...calls, { method: prop, args }]);
    },
  });
}

// Typed loosely on purpose: the code under test imports the real `Db` type from src/db/client.ts through tsc, and
// only Vitest swaps this object in.
export const db = chain([]) as never;

export async function withTransaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
  return fn(chain([]) as never);
}
