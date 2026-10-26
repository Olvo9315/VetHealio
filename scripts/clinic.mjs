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
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
    fs.rmSync(dir, { recursive: true, force: true });
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
      const out = run(
        `vercel deploy --yes ${prod ? "--prod" : ""} --build-env APP_RELEASE=${tag}`,
        { cwd: worktree, env: vercelEnv(c.projectId) }
      );
      const url = out.trim().split(/\s+/).filter((s) => s.startsWith("https://")).pop();
      console.log(prod ? `  ✓ live at ${c.url} (${url})` : `  ✓ test URL for the clinic: ${url}`);
    }
  } finally {
    run(`git worktree remove --force "${worktree}"`);
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

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "status") await status();
  else if (command === "deploy") deploy(args[0], args[1], args.includes("--prod"));
  else if (command === "new") newClinic(args[0], args[1], args[2]);
  else {
    console.log('Usage:\n  npm run clinic -- status\n  npm run clinic -- deploy <slug|all> <tag> [--prod]\n  npm run clinic -- new <slug> "<Clinic name>" <admin-email>');
    process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`✗ ${err.stderr?.toString() || err.message}`);
  process.exit(1);
}
