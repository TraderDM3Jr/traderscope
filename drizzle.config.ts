import { defineConfig } from "drizzle-kit";

// Reads the database URL from the environment, so the same command works for
// local dev (DATABASE_URL in .env) and production (DATABASE_URL on Vercel/Neon).
// Example: DATABASE_URL=<neon-url> npx drizzle-kit push
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
