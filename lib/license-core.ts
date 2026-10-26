import { createPublicKey, verify } from "crypto";
import { DEFAULT_MODULES, isModuleKey, type ModuleKey } from "./modules";

// Licenses are "<base64url payload>.<base64url Ed25519 signature>", signed with the
// vendor's private key (kept outside the repo, see scripts/license.mjs). Only the
// public key ships with the app, so a clinic cannot enable modules by editing its DB.
const PUBLIC_KEY = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANLK4KW81GhotZopekfw5ArPTekM51z3mcz3CvGF28oQ=
-----END PUBLIC KEY-----`);

export type LicensePayload = {
  clinic: string;
  modules: ModuleKey[];
  issuedAt: string;
  // ISO date; absent = no expiry
  expiresAt?: string;
};

export type LicenseState =
  | { status: "none"; modules: ModuleKey[] }
  | { status: "valid"; modules: ModuleKey[]; license: LicensePayload }
  | { status: "expired" | "invalid"; modules: ModuleKey[]; license?: LicensePayload };

export function parseLicense(key: string): LicensePayload | null {
  const [payload, signature] = key.trim().split(".");
  if (!payload || !signature) return null;
  try {
    const ok = verify(null, Buffer.from(payload), PUBLIC_KEY, Buffer.from(signature, "base64url"));
    if (!ok) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LicensePayload;
    return { ...data, modules: (data.modules ?? []).filter(isModuleKey) };
  } catch {
    return null;
  }
}

export function evaluateLicense(key: string | null | undefined, now = new Date()): LicenseState {
  if (!key) return { status: "none", modules: DEFAULT_MODULES };
  const license = parseLicense(key);
  // A broken or expired license falls back to the defaults rather than locking the clinic out
  if (!license) return { status: "invalid", modules: DEFAULT_MODULES };
  if (license.expiresAt && new Date(license.expiresAt) < now) {
    return { status: "expired", modules: DEFAULT_MODULES, license };
  }
  return { status: "valid", modules: license.modules, license };
}
