import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, non-sensitive build info used by scripts/clinic.mjs to report what each clinic runs
export function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    environment: process.env.VERCEL_ENV ?? "local",
    database: process.env.STAGING_DATABASE_URL ? "staging" : "production",
  });
}
