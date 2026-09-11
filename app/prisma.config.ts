// Load .env for Prisma CLI commands (migrate/seed/studio). Defining a
// prisma.config.ts disables Prisma's automatic .env loading, so we restore it
// explicitly — this matches what the CLI did before. The running app reads
// DATABASE_URL via Next.js env loading, independent of this file.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma configuration — replaces the deprecated `package.json#prisma` block
// (which Prisma 7 removes). Pinned to Prisma 6.x for stability.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
