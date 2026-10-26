#!/usr/bin/env node
// Creates prisma/migrations/<timestamp>_<name>/migration.sql from the difference between
// the local database (already at the latest migration) and prisma/schema.prisma, then
// applies it locally. Used instead of `prisma migrate dev`, whose shadow database does
// not work with the local `prisma dev` server.
//
//   npm run db:new-migration -- add_owner_language
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error("Usage: npm run db:new-migration -- <snake_case_name>");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

const status = run("npx prisma migrate status");
if (!status.includes("Database schema is up to date")) {
  console.error("Local database is not at the latest migration. Run: npx prisma migrate deploy");
  process.exit(1);
}

const sql = run("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script");
const body = sql.slice(sql.indexOf("--"));
if (!body.trim() || /^-- This is an empty migration/m.test(body)) {
  console.log("No schema changes.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = path.join("prisma", "migrations", `${stamp}_${name}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "migration.sql"), body);
console.log(`Created ${dir}/migration.sql:\n\n${body}`);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
