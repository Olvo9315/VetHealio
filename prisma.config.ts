// Prisma CLI config (migrate, seed, studio). Loads .env.local first, then .env,
// matching how Next.js resolves env files.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./lib/database-url";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationDatabaseUrl(),
  },
});
