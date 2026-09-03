# ADR-013 Login-required live deployment

## Context

The blueprint's FR-120 and AC-UI-04 specified signed, login-free reviewer links: `GET /api/auth/tour/:token` exchanged a link for a read-only session bound to one demo account, the reviewer landing rendered without credentials, and `REVIEWER_LINK_SECRET` signed and rotated the links. On 3 September 2026 Ghaisan instructed that the live deployment be fully behind login, to prevent abuse of an unlisted public URL (deviation D-07).

## Decision

The live deployment (`https://thehub-3v.vercel.app`) is fully behind credentials login. The principals are the three demo accounts (Engineer, Supervisor, Manager) and the Admin account, which is never distributed. Only `/login` and the data-free `/api/health` answer without a session. The tour is the post-login landing. No signed or bearer link is issued or accepted; the frozen `ReviewerLink` type and the `REVIEWER_LINK_SECRET` name stay in the contracts marked `"x-status": "not built in this run (D-07)"`, and no route consumes them. Credentials never appear in any submitted or committed file: the generator writes them into a gitignored root file whose path the Report names, and they are handed to the Committee out of band. The export stays static and login-free, because it holds no live route.

## Alternatives

- Signed login-free reviewer links bound to a demo account, as FR-120 asked: removed under D-07.

## Consequences

- No bearer links exist; there is nothing to expire, revoke or rotate, and the expired and revoked link states are not rendered.
- Credentials are handed to the Committee out of band; the Report names the file that holds them.
- Abuse is bounded by the rate limits of blueprint 9.9 (30 asks and 5 draft creations per minute per account, 120 requests per minute per address, counted in PostgreSQL per ADR-011) and by the daily cap on live inference (AC-ANS-20, AC-NFR-15).
- FR-120 and AC-UI-04 are adjusted: the landing and the tour are tested after login; the string audit for passwords and keys in submitted files remains.
- The deployment stays unlisted and noindex (invariant 7); the export is unaffected.

## Status

Accepted 2026-09-03
