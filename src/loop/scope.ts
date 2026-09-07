// The per-browser draft sandbox (blueprint section 2 "per-session draft store", D-16, ARCHITECTURE 8.5; AC-LOOP-13,
// NFR-17). Two lines of policy, kept in one place because every drafting route repeats them: a draft created through
// the product carries the visitor's sandbox id, and every read of a draft is filtered by
// `session_scope IS NULL OR session_scope = <this browser's sandbox>`, so the seeded replay sources (scope null) are
// visible to everyone and one visitor's draft never reaches another visitor. The predicate is a Drizzle fragment
// with the sandbox id bound as a parameter, never interpolated.
import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { Sandbox } from "@/auth/sandbox";
import { draftDocument } from "@/db/schema";

/** The `session_scope` a new draft is written with: the visitor's sandbox, or null before the first login. */
export function draftScope(box: Pick<Sandbox, "id"> | null): string | null {
  return box?.id ?? null;
}

/** The scope filter every draft read carries. */
export function visibleScope(box: Pick<Sandbox, "id"> | null): SQL {
  const seeded = isNull(draftDocument.sessionScope);
  if (!box) return seeded;
  const both = or(seeded, eq(draftDocument.sessionScope, box.id));
  if (!both) throw new Error("scope: or() produced no predicate"); // unreachable: both operands are defined
  return both;
}
