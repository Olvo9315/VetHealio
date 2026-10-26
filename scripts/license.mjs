#!/usr/bin/env node
// Signs a module license with the vendor's private key (never commit it).
// Default key location: ~/.vethealio/license-private.pem (override with VETHEALIO_LICENSE_KEY_FILE).
//
//   node scripts/license.mjs <clinic-slug> <module,module,...> [--expires YYYY-MM-DD]
import { createPrivateKey, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const KNOWN_MODULES = ["inventory", "staff", "smsReminders", "presvet", "knowledgeBase"];

export function signLicense(clinic, modules, expiresAt) {
  const unknown = modules.filter((m) => !KNOWN_MODULES.includes(m));
  if (unknown.length) throw new Error(`Unknown modules: ${unknown.join(", ")}. Known: ${KNOWN_MODULES.join(", ")}`);
  const keyFile = process.env.VETHEALIO_LICENSE_KEY_FILE || path.join(os.homedir(), ".vethealio", "license-private.pem");
  const privateKey = createPrivateKey(fs.readFileSync(keyFile, "utf8"));
  const payload = { clinic, modules, issuedAt: new Date().toISOString(), ...(expiresAt ? { expiresAt } : {}) };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(encoded), privateKey).toString("base64url");
  return `${encoded}.${signature}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [clinic, list, ...rest] = process.argv.slice(2);
  const expiresIdx = rest.indexOf("--expires");
  if (!clinic || list === undefined) {
    console.error("Usage: node scripts/license.mjs <clinic> <module,module,...> [--expires YYYY-MM-DD]");
    process.exit(1);
  }
  const modules = list ? list.split(",").map((m) => m.trim()).filter(Boolean) : [];
  console.log(signLicense(clinic, modules, expiresIdx >= 0 ? rest[expiresIdx + 1] : undefined));
}
