// The setup of the `db` project (vitest.config.ts), run before every file under tests/db. TEST_DATABASE_URL names
// the disposable database of this lane (the service container of ci.yml, or the same docker pair started locally)
// and becomes the client's DATABASE_URL for the run; DATABASE_URL_APP is cleared so a developer's shell can never
// point this lane at the production database, and without TEST_DATABASE_URL no URL is set at all, so every file
// skips itself. NEON_LOCAL_PROXY routes the driver through the local proxy (tests/db/neon-local.mjs).
import "./neon-local.mjs";

const url = process.env.TEST_DATABASE_URL;
delete process.env.DATABASE_URL_APP;
if (url) process.env.DATABASE_URL = url;
else delete process.env.DATABASE_URL;
