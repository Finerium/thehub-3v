import { defineConfig } from "drizzle-kit";

// Migrations run over the unpooled Neon URL only (blueprint 9.15); the application connects with the pooled
// DATABASE_URL. `drizzle-kit generate` works offline, so an unset variable only fails `migrate`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public", "draft"],
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
  strict: true,
  verbose: true,
});
