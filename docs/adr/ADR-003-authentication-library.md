# ADR-003 Authentication library

## Context

Auth.js entered security-patch mode under the Better Auth team in September 2025 and directs new projects to Better Auth. The blueprint left the choice between Better Auth and a minimal in-house session layer to the Orchestrator, conditioned on whether the library could express the signed reviewer-link exchange cleanly. On 3 September 2026 that exchange was removed: the live deployment is fully behind credentials login (deviation D-07, ADR-013). The behaviour of NFR-08 is the lock, not the library.

## Decision

NFR-08's behaviour is implemented with a minimal in-house session layer: credentials login only, bcrypt password hashes, server-side database sessions carried in an 8-hour httpOnly SameSite=Lax cookie, no self-registration, no reset path, logout, and one `authorize(role)` helper imported by every mutating route. Better Auth is not adopted, because the reviewer-link exchange it would have served is not built. Auth.js is not used for a new build.

## Alternatives

- Better Auth (email and password with sign-up disabled, database sessions, an 8-hour cookie): not adopted under D-07; it would add a dependency for an exchange that no longer exists.
- Auth.js: not used for a new build (security-patch mode).

## Consequences

- The permission matrix of blueprint 9.9 is enforced by the one helper regardless of library; every mutating route returns 403 with an audit event when the role lacks the column.
- The principals are the three demo accounts and the undistributed Admin account (ADR-013); there is no reviewer session and no session bound to a link.
- Sessions live in PostgreSQL (AC-NFR-18); the cookie and route behaviour is checked by AC-NFR-08's route audit.

## Status

Accepted 2026-09-03
