#!/usr/bin/env node
// Clinic instance management. Every clinic is its own Vercel project with:
//   - Production: production Neon DB (DATABASE_URL)
//   - Preview:    staging Neon DB (STAGING_DATABASE_URL) for the clinic to test a release
// Deploys are explicit (git auto-deploys are off in vercel.json): a release tag is
// built from a clean git worktree and pushed to the chosen clinic and environment.
//
//   npm run clinic -- status
//   npm run clinic -- deploy <slug|all> <tag> [--prod]
//   npm run clinic -- new <slug> "<Clinic name>" <admin-email>
//   npm run clinic -- license <slug> <module,module,...|default> [--expires YYYY-MM-DD]
//   npm run clinic -- catalog <slug|all> [--dry-run]
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { signLicense } from "./license.mjs";
import { LOCALES, SERVICE_CATALOG } from "../prisma/service-catalog.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const REGISTRY = path.join(ROOT, "clinics.json");
const CREDENTIALS = path.join(ROOT, "clinics.local.md");

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8", ...opts });
}

function runVisible(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function vercelEnv(projectId) {
  return { ...process.env, VERCEL_ORG_ID: registry.orgId, VERCEL_PROJECT_ID: projectId };
}

function findClinics(slug) {
  if (slug === "all") return registry.clinics.filter((c) => c.slug !== "demo");
  const clinic = registry.clinics.find((c) => c.slug === slug);
  if (!clinic) throw new Error(`Unknown clinic "${slug}". Known: ${registry.clinics.map((c) => c.slug).join(", ")}`);
  return [clinic];
}

// Stable alias of a clinic's latest test (Preview) deployment
function testUrlFor(clinic) {
  const host = new URL(clinic.url).host.replace(/\.vercel\.app$/, "");
  return `https://${host}-test.vercel.app`;
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Reads KEY=value pairs from a dotenv file written by `vercel env pull`
function readEnvFile(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// Pulls one Vercel environment's variables into memory (temp file is deleted right away)
function pullEnv(projectId, environment) {
  const dir = tmpDir("vh-env-");
  const file = path.join(dir, ".env.pulled");
  try {
    run(`vercel env pull "${file}" --environment=${environment} --yes`, { env: vercelEnv(projectId), cwd: dir });
    return readEnvFile(file);
  } finally {
    // The file holds secrets: always delete it. Windows may keep the folder busy for a moment.
    fs.rmSync(file, { force: true });
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // empty temp folder, harmless
    }
  }
}

async function status() {
  for (const c of registry.clinics) {
    let info = "unreachable";
    try {
      const res = await fetch(`${c.url}/api/version`, { signal: AbortSignal.timeout(20000) });
      const v = await res.json();
      info = `${v.version} (${v.environment}, db: ${v.database})`;
    } catch {
      // keep "unreachable"
    }
    console.log(`${c.slug.padEnd(14)} ${c.name.padEnd(42)} ${info}\n${" ".repeat(15)}${c.url}`);
  }
}

function deploy(slug, tag, prod) {
  if (!tag) throw new Error("Missing release tag, e.g. v0.3.0");
  run(`git rev-parse --verify "refs/tags/${tag}"`);
  const clinics = findClinics(slug);

  // Build from a clean checkout of the tag, never from the working tree
  const worktree = tmpDir("vh-release-");
  fs.rmSync(worktree, { recursive: true, force: true });
  run(`git worktree add --detach "${worktree}" "refs/tags/${tag}"`);
  try {
    for (const c of clinics) {
      const target = prod ? "PRODUCTION" : "preview (staging DB)";
      console.log(`\n▶ ${c.name}: deploying ${tag} → ${target}`);
      // Vercel prints the deployment URL on stderr
      const out = run(
        `vercel deploy --yes ${prod ? "--prod" : ""} --build-env APP_RELEASE=${tag} 2>&1`,
        { cwd: worktree, env: vercelEnv(c.projectId) }
      );
      const url = out.match(/https:\/\/[\w.-]+\.vercel\.app/g)?.[0];
      if (prod) {
        console.log(`  ✓ live at ${c.url} (${url})`);
      } else {
        // Stable address the clinic can bookmark: always points to its latest test deployment
        const testUrl = testUrlFor(c);
        run(`vercel alias set ${url} ${new URL(testUrl).host}`, { env: vercelEnv(c.projectId) });
        console.log(`  ✓ test version for the clinic: ${testUrl} (${url})`);
      }
    }
  } finally {
    try {
      run(`git worktree remove --force "${worktree}"`);
    } catch {
      // Windows may still hold files from the upload; prune later
      run("git worktree prune");
    }
  }
}

function migrateAndSeed(dbEnv, seedEnv) {
  const env = { ...process.env, ...dbEnv, ...seedEnv };
  runVisible("npx prisma migrate deploy", { env });
  runVisible("npx tsx prisma/seed.ts", { env });
}

function newClinic(slug, name, adminEmail) {
  if (!slug || !name || !adminEmail) throw new Error('Usage: new <slug> "<Clinic name>" <admin-email>');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Slug must be lowercase letters, digits and dashes");
  if (registry.clinics.some((c) => c.slug === slug)) throw new Error(`Clinic "${slug}" already exists`);
  const project = `vethealio-${slug}`;

  console.log(`▶ Creating Vercel project ${project}`);
  run(`vercel project add ${project}`);
  const linkDir = tmpDir("vh-link-");
  run(`vercel link --yes --project ${project}`, { cwd: linkDir });
  const projectId = JSON.parse(fs.readFileSync(path.join(linkDir, ".vercel", "project.json"), "utf8")).projectId;
  const env = vercelEnv(projectId);

  console.log("▶ Auth secrets (production + preview)");
  run("vercel env add AUTH_SECRET production", { cwd: linkDir, input: randomBytes(32).toString("base64") });
  // Preview needs an explicit (empty = all branches) git branch argument to run non-interactively
  run(`vercel env add AUTH_SECRET preview "" --value ${randomBytes(32).toString("hex")} --yes`, { cwd: linkDir });

  console.log("▶ Neon databases (production + staging), Frankfurt, free plan");
  const neon = "-m region=fra1 -m auth=false --plan free_v3 --no-env-pull --non-interactive";
  run(`vercel integration add neon -n neon-${project} ${neon}`, { cwd: linkDir });
  run(`vercel integration add neon -n neon-${project}-staging -e preview --prefix STAGING_ ${neon}`, { cwd: linkDir });
  fs.rmSync(linkDir, { recursive: true, force: true });

  const password = randomBytes(9).toString("base64url");
  const seedEnv = {
    SEED_CLINIC_NAME: name,
    SEED_ADMIN_EMAIL: adminEmail,
    SEED_ADMIN_FIRST_NAME: "Admin",
    SEED_ADMIN_LAST_NAME: name,
    SEED_ADMIN_PASSWORD: password,
  };

  console.log("▶ Production DB: migrations + seed");
  const prodEnv = pullEnv(projectId, "development");
  migrateAndSeed({ DATABASE_URL: prodEnv.DATABASE_URL, DATABASE_URL_UNPOOLED: prodEnv.DATABASE_URL_UNPOOLED }, seedEnv);

  console.log("▶ Staging DB: migrations + seed");
  const previewEnv = pullEnv(projectId, "preview");
  migrateAndSeed(
    {
      STAGING_DATABASE_URL: previewEnv.STAGING_DATABASE_URL,
      STAGING_DATABASE_URL_UNPOOLED: previewEnv.STAGING_DATABASE_URL_UNPOOLED,
    },
    seedEnv
  );

  const url = `https://${project}.vercel.app`;
  registry.clinics.push({ slug, name, projectId, url });
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  fs.appendFileSync(
    CREDENTIALS,
    `## ${name}\n- Сайт: ${url}\n- Логин: ${adminEmail}\n- Пароль: ${password}\n- (тот же логин и пароль в тестовой версии)\n\n`
  );
  console.log(`\n✓ Clinic "${name}" created. Credentials saved to clinics.local.md.`);
  console.log(`  Next: npm run clinic -- deploy ${slug} <tag> --prod`);
}

// Writes a signed license into the clinic's production and staging databases (no redeploy needed)
async function setLicense(slug, list, expiresAt) {
  if (!slug || list === undefined) throw new Error("Usage: license <slug> <module,module,...|default> [--expires YYYY-MM-DD]");
  const [clinic] = findClinics(slug);
  const key = list === "default" ? null : signLicense(slug, list.split(",").map((m) => m.trim()).filter(Boolean), expiresAt);

  const targets = [["production", pullEnv(clinic.projectId, "development").DATABASE_URL]];
  const staging = pullEnv(clinic.projectId, "preview").STAGING_DATABASE_URL;
  if (staging) targets.push(["staging", staging]);

  for (const [label, url] of targets) {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      await db.query(
        `INSERT INTO "ClinicSettings" (id, "licenseKey", "updatedAt") VALUES ('default', $1, now())
         ON CONFLICT (id) DO UPDATE SET "licenseKey" = EXCLUDED."licenseKey", "updatedAt" = now()`,
        [key]
      );
    } finally {
      await db.end();
    }
    console.log(`  ✓ ${clinic.name} (${label}): ${key ? `modules = ${list || "(none)"}` : "default modules"}`);
  }
}

// Adds the default service catalog to an existing clinic (production + staging DBs) without
// touching what the clinic already has: an entry is skipped when a service with the same name
// (official or translated, any case) exists under the same parent; nothing is renamed, deleted
// or re-priced. New services get no price, like in a new clinic.
async function addCatalog(slug, dryRun) {
  if (!slug) throw new Error("Usage: catalog <slug|all> [--dry-run]");
  for (const clinic of findClinics(slug)) {
    const targets = [["production", pullEnv(clinic.projectId, "development").DATABASE_URL]];
    const staging = pullEnv(clinic.projectId, "preview").STAGING_DATABASE_URL;
    if (staging) targets.push(["staging", staging]);

    for (const [label, url] of targets) {
      const db = new pg.Client({ connectionString: url });
      await db.connect();
      try {
        const settings = await db.query(`SELECT "dataLocale" FROM "ClinicSettings" WHERE id = 'default'`);
        const locale = LOCALES.includes(settings.rows[0]?.dataLocale) ? settings.rows[0].dataLocale : "es";
        const { rows } = await db.query(`SELECT id, name, translations, "parentId", "sortOrder" FROM "Service"`);
        const norm = (v) => String(v ?? "").trim().toLowerCase();
        const namesOf = (r) => [r.name, ...Object.values(r.translations ?? {})].map(norm);
        let added = 0;
        const lines = [];

        await db.query("BEGIN");
        const level = async (entries, parentId, depth) => {
          const siblings = rows.filter((r) => r.parentId === parentId);
          let nextSort = siblings.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);
          for (const entry of entries) {
            const labels = Object.values(entry.labels).map(norm);
            let match = siblings.find((r) => namesOf(r).some((n) => labels.includes(n)));
            if (!match) {
              const id = "c" + randomBytes(12).toString("hex");
              const translations = Object.fromEntries(LOCALES.filter((l) => l !== locale).map((l) => [l, entry.labels[l]]));
              match = { id, name: entry.labels[locale], translations, parentId, sortOrder: nextSort++ };
              if (!dryRun) {
                await db.query(
                  `INSERT INTO "Service" (id, name, translations, color, price, "isActive", "sortOrder", "parentId", "createdAt", "updatedAt")
                   VALUES ($1, $2, $3, $4, NULL, true, $5, $6, now(), now())`,
                  [id, match.name, JSON.stringify(translations), entry.color ?? null, match.sortOrder, parentId]
                );
              }
              rows.push(match);
              added++;
              lines.push(`${"  ".repeat(depth)}+ ${match.name}`);
            }
            if (entry.children) await level(entry.children, match.id, depth + 1);
          }
        };
        await level(SERVICE_CATALOG, null, 0);
        await db.query(dryRun ? "ROLLBACK" : "COMMIT");

        console.log(`  ${dryRun ? "•" : "✓"} ${clinic.name} (${label}): ${rows.length - added} existing, ${added} ${dryRun ? "would be added" : "added"}`);
        if (dryRun && lines.length) console.log(lines.map((l) => "      " + l).join("\n"));
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        await db.end();
      }
    }
  }
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "status") await status();
  else if (command === "deploy") deploy(args[0], args[1], args.includes("--prod"));
  else if (command === "new") newClinic(args[0], args[1], args[2]);
  else if (command === "license") {
    const i = args.indexOf("--expires");
    await setLicense(args[0], args[1], i >= 0 ? args[i + 1] : undefined);
  }
  else if (command === "catalog") await addCatalog(args[0], args.includes("--dry-run"));
  else {
    console.log('Usage:\n  npm run clinic -- status\n  npm run clinic -- deploy <slug|all> <tag> [--prod]\n  npm run clinic -- new <slug> "<Clinic name>" <admin-email>\n  npm run clinic -- license <slug> <module,module,...|default> [--expires YYYY-MM-DD]\n  npm run clinic -- catalog <slug|all> [--dry-run]');
    process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`✗ ${err.stderr?.toString() || err.message}`);
  process.exit(1);
}
